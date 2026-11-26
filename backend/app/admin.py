"""Écritures : rafraîchissement / application des inputs de marché et saisie des fixings de marché.

Sécurité : toute écriture exige l'en-tête `X-Admin-Token` égal à la variable d'environnement ADMIN_TOKEN.
Sans ADMIN_TOKEN, les écritures ne sont acceptées qu'en local (127.0.0.1) : un déploiement public sans jeton
reste donc en lecture seule.

Traçabilité : avant chaque écriture, le fichier remplacé est archivé dans euroinfl/data/vintages/.
"""

from __future__ import annotations

import hmac
import json
import os
import shutil
import subprocess
import sys
import threading
from datetime import date, datetime
from pathlib import Path

from fastapi import Header, HTTPException, Request

from . import config
from .catalog import FIXINGS
from .store import read_json

PROPOSAL = config.ENGINE_DATA_DIR / "market_inputs.proposed.json"
VINTAGES = config.ENGINE_DATA_DIR / "vintages"
# Prix à la pompe (Weekly Oil Bulletin) : fichier lu par le moteur et sa proposition, appliqués ensemble
WOB_FILE = config.ENGINE_DATA_DIR / "wob_weekly.csv"
WOB_PROPOSAL = config.ENGINE_DATA_DIR / "wob_weekly.proposed.csv"
WOB_DIFF_COLS = {
    "wob_e95_EA": "Euro-super 95 TTC zone euro (WOB)",
    "wob_dsl_EA": "Gazole TTC zone euro (WOB)",
    "wob_heat_EA": "Fioul domestique TTC zone euro (WOB)",
}
LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost", "testclient"}
_LOCK = threading.Lock()

# Fixings saisissables : indice, et pays du modèle avec lequel la comparaison est légitime (None = indice différent)
FIXING_INDICES = {
    "EA": {"label": "HICPxT zone euro (hors tabac)", "comparable_geo": "EA"},
    "FR": {"label": "IPC France hors tabac (Insee)", "comparable_geo": None},
}
FIXING_BOUNDS = (-5.0, 25.0)


def require_admin(request: Request, x_admin_token: str | None = Header(default=None)) -> None:
    token = os.environ.get("ADMIN_TOKEN")
    if token:
        if not x_admin_token or not hmac.compare_digest(x_admin_token.encode(), token.encode()):
            raise HTTPException(403, "jeton d'administration invalide")
        return
    host = request.client.host if request.client else ""
    if host not in LOCAL_HOSTS:
        raise HTTPException(403, "écriture désactivée : définir ADMIN_TOKEN sur le serveur")


def write_json(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    tmp.replace(path)  # écriture atomique


def archive(path: Path) -> Path | None:
    if not path.exists():
        return None
    VINTAGES.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = VINTAGES / f"{path.stem}_{stamp}{path.suffix}"
    shutil.copy2(path, dest)
    return dest


# ------------------------------------------------------------------ inputs de marché
def ice_gasoil_monthly():
    """Gasoil ICE historique ($/t) de la base, pour calibrer le proxy ULSD."""
    from euroinfl.data import load_user_db

    db = load_user_db(config.ENGINE_DATA_DIR / "euro_inflation_database_long.csv")
    return (db["legacy_gasoil_1m"] * 7.443).dropna()


def _wob_monthly(path: Path, last_week: str | None, asof: str | None):
    """Moyennes mensuelles WOB telles que le moteur les lit pour un millésime donné."""
    import pandas as pd
    from euroinfl import wob

    weekly, _ = wob.load(path)
    if last_week:
        cutoff = pd.Timestamp(last_week)
    elif asof:
        cutoff = pd.Timestamp(asof) - pd.Timedelta(days=3)
    else:
        cutoff = None
    return wob.monthly(weekly, cutoff)


def wob_diff(current: dict, proposed: dict, has_proposal: bool) -> list[dict]:
    """Lignes de diff des prix à la pompe zone euro (moyennes mensuelles des mois récents)."""
    if not WOB_FILE.exists():
        return []
    cur = _wob_monthly(WOB_FILE, current.get("wob_last_week"), current.get("asof"))
    new = _wob_monthly(
        WOB_PROPOSAL if has_proposal else WOB_FILE, proposed.get("wob_last_week"), proposed.get("asof")
    )
    months = sorted(k for k in proposed["recent_months"] if not k.startswith("_"))
    rows = []
    for m in months:
        for col, label in WOB_DIFF_COLS.items():
            a = cur[col].get(m) if col in cur else None
            b = new[col].get(m) if col in new else None
            a = None if a is None or a != a else round(float(a), 1)
            b = None if b is None or b != b else round(float(b), 1)
            chg = (b / a - 1) * 100 if a and b is not None else None
            rows.append(
                {
                    "section": "recent",
                    "key": col,
                    "label": label,
                    "unit": "€/1 000 l",
                    "period": m,
                    "current": a,
                    "proposed": b,
                    "change_pct": chg,
                }
            )
    return rows


def refresh(fetcher=None, today: date | None = None) -> dict:
    from euroinfl import wob

    from .marketdata.refresh import PublicFetcher, build_proposal, diff

    fetcher = fetcher or PublicFetcher()
    current = read_json(config.MARKET_INPUTS)
    p = build_proposal(current, ice_gasoil_monthly(), today or date.today(), fetcher)
    # Prix à la pompe : historique WOB complet, appliqué avec la proposition
    WOB_PROPOSAL.unlink(missing_ok=True)
    has_wob = False
    if hasattr(fetcher, "wob_history"):
        try:
            import io

            weekly, vat = wob.parse_history(io.BytesIO(fetcher.wob_history()))
            wob.save(weekly, vat, WOB_PROPOSAL)
            last = weekly["date"].max()
            p.inputs["wob_last_week"] = last.date().isoformat()
            p.warnings.append(
                f"Prix à la pompe : Weekly Oil Bulletin, dernier relevé du {last.date().isoformat()}"
            )
            has_wob = True
        except Exception as e:  # source indisponible : on garde le fichier en place
            p.warnings.append(
                f"Weekly Oil Bulletin indisponible ({e}) : prix à la pompe précédents conservés"
            )
    if not has_wob and current.get("wob_last_week"):
        p.inputs["wob_last_week"] = current["wob_last_week"]
    payload = {
        "created": datetime.now().isoformat(timespec="seconds"),
        "warnings": p.warnings,
        "gasoil_ratio": p.gasoil_ratio,
        "wob": has_wob,
        "inputs": p.inputs,
    }
    with _LOCK:
        write_json(PROPOSAL, payload)
    return {**payload, "diff": diff(current, p.inputs) + wob_diff(current, p.inputs, has_wob)}


def proposal() -> dict | None:
    from .marketdata.refresh import diff

    if not PROPOSAL.exists():
        return None
    payload = read_json(PROPOSAL)
    current = read_json(config.MARKET_INPUTS)
    has_wob = bool(payload.get("wob")) and WOB_PROPOSAL.exists()
    return {
        **payload,
        "diff": diff(current, payload["inputs"]) + wob_diff(current, payload["inputs"], has_wob),
    }


def run_engine() -> str:
    """Relance euroinfl/run_all.py (≈ 10 s), comme en ligne de commande."""
    env = {**os.environ, "PYTHONUTF8": "1"}
    r = subprocess.run(  # noqa: S603 (commande fixe, sans entrée utilisateur)
        [sys.executable, "run_all.py"],
        cwd=config.ENGINE_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=600,
    )
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout)[-2000:])
    return r.stdout[-1500:]


def export_static_if_present() -> bool:
    target = config.ROOT / "frontend" / "public" / "data"
    if not target.exists():
        return False
    sys.path.insert(0, str(config.ROOT / "backend"))
    from export_static import export  # noqa: PLC0415

    export(target)
    return True


def apply_proposal(reload) -> dict:
    """Remplace market_inputs.json par la proposition, relance le moteur, recharge l'API.
    En cas d'échec du moteur, l'ancien fichier est restauré et le moteur relancé dessus."""
    with _LOCK:
        if not PROPOSAL.exists():
            raise HTTPException(409, "aucune proposition à appliquer : lancer d'abord un rafraîchissement")
        payload = read_json(PROPOSAL)
        saved = archive(config.MARKET_INPUTS)
        wob_new = bool(payload.get("wob")) and WOB_PROPOSAL.exists()
        wob_saved = archive(WOB_FILE) if wob_new else None
        write_json(config.MARKET_INPUTS, payload["inputs"])
        if wob_new:
            shutil.copy2(WOB_PROPOSAL, WOB_FILE)
        try:
            log = run_engine()
        except Exception as e:
            if saved:
                shutil.copy2(saved, config.MARKET_INPUTS)
            if wob_saved:
                shutil.copy2(wob_saved, WOB_FILE)
            if saved or wob_saved:
                run_engine()
            raise HTTPException(500, f"le moteur a échoué, inputs précédents restaurés : {e}") from e
        PROPOSAL.unlink(missing_ok=True)
        WOB_PROPOSAL.unlink(missing_ok=True)
        reload()
        exported = export_static_if_present()
    return {
        "applied": True,
        "archived": saved.name if saved else None,
        "asof": payload["inputs"]["asof"],
        "static_exported": exported,
        "engine_log": log,
    }


# ------------------------------------------------------------------ fixings de marché
def save_fixings(key: str, asof: str, values: dict[str, float | None], reload) -> dict:
    if key not in FIXING_INDICES:
        raise HTTPException(422, f"indice inconnu : {key} (attendu : {', '.join(FIXING_INDICES)})")
    try:
        date.fromisoformat(asof)
    except ValueError as e:
        raise HTTPException(422, f"date de relevé invalide : {asof}") from e
    bad = [f for f in values if f not in FIXINGS]
    lo, hi = FIXING_BOUNDS
    out = [f for f, v in values.items() if v is not None and not lo <= v <= hi]
    if bad or out:
        raise HTTPException(422, f"fixings inconnus {bad} ou hors bornes [{lo}, {hi}] % : {out}")
    with _LOCK:
        mf = read_json(config.MARKET_FIXINGS)
        archive(config.MARKET_FIXINGS)
        mf.setdefault("indices", FIXING_INDICES)
        mf.setdefault("fixings", {})
        mf.setdefault("asof_by_index", {})
        mf["fixings"][key] = {f: v for f, v in sorted(values.items()) if v is not None}
        mf["asof_by_index"][key] = asof
        mf["asof"] = max(mf["asof_by_index"].values())
        write_json(config.MARKET_FIXINGS, mf)
    reload()
    return mf
