"""Explorateur d'équations : relit out/equations.json et la spécification du moteur (pipeline) pour
reconstruire la formule lisible et la table des termes. Aucun coefficient n'est recalculé."""

from __future__ import annotations

import re

from .catalog import DRIVER_LABELS, ENERGY_ITEMS, LABELS, REGIME_START, P

TERM_RE = re.compile(r"^(?P<driver>\w+)\[(?P<lo>\d+)-(?P<hi>\d+)\](?P<regime>×régime)?$")
STAGE1 = "EA-stage1"


def spec(geo: str, item: str):
    """Equation non estimée du moteur (buckets, ar, easter, régime) pour connaître la forme exacte."""
    if geo == STAGE1:
        return P.stage1_equations().get(item)
    eqs = {**P.energy_equations(geo), **P.core_equations(geo)}
    return eqs.get(item)


def _window(lo: int, hi: int) -> str:
    return f"t−{lo}" if lo == hi else f"t−{lo}…t−{hi}"


def describe(geo: str, item: str, raw: dict, elasticity_rows: list[dict]) -> dict:
    e = spec(geo, item)
    kinds = {b.label: b.kind for b in e.buckets} if e else {}
    coef, tstat = raw["coef"], raw.get("t", {})
    drift = raw.get("drift")

    terms, seasonal = [], {}
    for k, v in coef.items():
        if re.fullmatch(r"m\d\d", k):
            seasonal[k] = v
            continue
        m = TERM_RE.match(k)
        if m:
            label = f"{m['driver']}[{m['lo']}-{m['hi']}]"
            terms.append(
                {
                    "term": k,
                    "type": "regime" if m["regime"] else "driver",
                    "driver": m["driver"],
                    "driver_label": DRIVER_LABELS.get(m["driver"], (m["driver"], ""))[0],
                    "lag_from": int(m["lo"]),
                    "lag_to": int(m["hi"]),
                    "transform": kinds.get(label, "dlog"),
                    "coef": v,
                    "t": tstat.get(k),
                }
            )
        else:
            terms.append(
                {
                    "term": k,
                    "type": k,
                    "driver": None,
                    "driver_label": None,
                    "lag_from": None,
                    "lag_to": None,
                    "transform": None,
                    "coef": v,
                    "t": tstat.get(k),
                }
            )

    # Effet saisonnier effectif par mois (Equation.season) : avec dérive fixée, s_m = drift + m_m, s_12 = drift − Σ
    if drift is not None:
        a = [seasonal.get(f"m{j:02d}", 0.0) for j in range(1, 12)]
        season_eff = {f"m{j:02d}": drift + a[j - 1] for j in range(1, 12)}
        season_eff["m12"] = drift - sum(a)
    else:
        season_eff = dict(seasonal)

    return {
        "key": f"{geo}/{item}",
        "geo": geo,
        "item": item,
        "name": raw["name"],
        "item_label": LABELS.get(item, DRIVER_LABELS.get(item, (item, ""))[0]),
        "formula": formula(item, terms, has_rho="rho" in coef, has_easter="easter" in coef, drift=drift),
        "terms": terms,
        "seasonal_raw": seasonal,
        "seasonal_effective": season_eff,
        "stats": raw.get("stats", {}),
        "regime_active": raw.get("regime_active", False),
        "regime_start": REGIME_START if (e is not None and e.regime_start) else None,
        "drift": drift,
        "half_life": raw.get("half_life"),
        "elasticities": elasticity_rows,
        "is_energy": item in ENERGY_ITEMS,
    }


def formula(item: str, terms: list[dict], has_rho: bool, has_easter: bool, drift: float | None) -> str:
    """Forme générale de MODELES §3, instanciée avec les termes réellement estimés."""
    parts = [f"s_mois{' (dérive ' + format(drift, '.2f') + ' %/mois)' if drift is not None else ''}"]
    if has_rho:
        parts.append("ρ·y(t−1)")
    i = 0
    for t in terms:
        if t["type"] not in ("driver", "regime"):
            continue
        x = f"Δlog {t['driver']}" if t["transform"] == "dlog" else t["driver"]
        sym = "γ" if t["type"] == "regime" else "β"
        if t["type"] == "driver":
            i += 1
        reg = f"·D({REGIME_START})" if t["type"] == "regime" else ""
        parts.append(f"{sym}{i}{reg}·moy({x}, {_window(t['lag_from'], t['lag_to'])})")
    if has_easter:
        parts.append("δ·Pâques(t)")
    return f"y(t) = 100·Δlog {item}(t) = " + " + ".join(parts)
