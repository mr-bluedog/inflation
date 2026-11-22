"""Couche données : indices HICP (Eurostat), poids 2026, prix de gros et drivers macro.

Conventions
- Toutes les séries mensuelles sont indexées par pandas.Period('M').
- Les indices HICP sont en base 2025=100 (Eurostat prc_hicp_minr, unité I25, ECOICOP v2).
- Les prix de gros sont des moyennes mensuelles du contrat front (EUR ou USD selon la série).
"""
from __future__ import annotations
import json
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
GEOS = ["EA", "IT", "FR", "DE", "ES"]
# Composantes de l'HICPxT (hors tabac) et sous-postes énergie
CORE = ["FOOD_P_X_TBC", "FOOD_NP", "IGD_NNRG", "SERV"]
ENERGY_ITEMS = ["CP0722", "CP0453", "CP0452", "CP0451"]   # carburants, fioul, gaz, électricité
LABELS = {
    "CP0722": "Carburants", "CP0453": "Fioul domestique", "CP0452": "Gaz", "CP0451": "Électricité",
    "NRG_OTHER": "Autre énergie (solide, chaleur)", "NRG": "Énergie",
    "FOOD_P_X_TBC": "Alimentation transformée (hors tabac)", "FOOD_NP": "Alimentation non transformée",
    "IGD_NNRG": "Biens industriels hors énergie (NEIG)", "SERV": "Services", "TOT_X_TBC": "HICP hors tabac",
}
COUNTRY_NAMES = {"EA": "Zone euro", "IT": "Italie", "FR": "France", "DE": "Allemagne", "ES": "Espagne"}


def _read_wide(path: Path) -> dict[str, pd.DataFrame]:
    lines = [l.strip() for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
    head = lines[0]
    first, last = head.split("months ")[1].split("..")
    idx = pd.period_range(first, last, freq="M")
    out: dict[str, dict[str, pd.Series]] = {}
    for l in lines[1:]:
        p = l.split(",")
        vals = [float(x) if x else np.nan for x in p[2:]]
        out.setdefault(p[0], {})[p[1]] = pd.Series(vals, index=idx)
    return {g: pd.DataFrame(d) for g, d in out.items()}


def load_hicp() -> dict[str, pd.DataFrame]:
    """Indices mensuels par pays : TOT_X_TBC, NRG, 4 sous-postes énergie, 4 composantes core."""
    e = _read_wide(DATA / "hicp_energy_I25.csv")
    c = _read_wide(DATA / "hicp_core_I25.csv")
    return {g: pd.concat([e[g], c[g]], axis=1) for g in GEOS}


def load_weights(year: int = 2026) -> dict[str, dict[str, float]]:
    """Poids Eurostat (pour mille du total) → poids normalisés.
    Retour : {geo: {'top': {energy,food_p,food_np,goods,services}, 'energy': {CP0722,...,NRG_OTHER}}}"""
    w = pd.read_csv(DATA / "weights_2026.csv")
    w = w[w.year == year].set_index("geo")
    out = {}
    for g in GEOS:
        r = w.loc[g]
        tot = r.NRG + r.FOOD_P_X_TBC + r.FOOD_NP + r.IGD_NNRG + r.SERV
        top = {"NRG": r.NRG / tot, "FOOD_P_X_TBC": r.FOOD_P_X_TBC / tot, "FOOD_NP": r.FOOD_NP / tot,
               "IGD_NNRG": r.IGD_NNRG / tot, "SERV": r.SERV / tot}
        sub = {k: r[k] / r.NRG for k in ENERGY_ITEMS}
        sub["NRG_OTHER"] = max(0.0, 1 - sum(sub.values()))
        out[g] = {"top": top, "energy": sub, "raw": r.to_dict()}
    return out


def load_user_db(path: str | Path | None = None) -> pd.DataFrame:
    """Base macro fournie (format long) → table mensuelle large (colonnes = indicator_code)."""
    if path is None:
        cands = list(Path("/mnt/user-data/uploads").glob("*euro_inflation_database_long*.csv")) + \
                list(DATA.glob("*database_long*.csv"))
        path = cands[0]
    d = pd.read_csv(path)
    d = d[(d.frequency == "M") & d.period.str.fullmatch(r"\d{4}-\d{2}")]
    w = d.pivot_table(index="period", columns="indicator_code", values="value", aggfunc="first")
    w.index = pd.PeriodIndex(w.index, freq="M")
    return w.sort_index()


def load_market_inputs() -> dict:
    return json.loads((DATA / "market_inputs.json").read_text(encoding="utf-8"))


def wholesale_history(db: pd.DataFrame, mkt: dict) -> pd.DataFrame:
    """Prix de gros mensuels historiques (front-month) + mois récents estimés (market_inputs.json).
    Colonnes : ttf (EUR/MWh), power_fr, power_de (EUR/MWh), gasoil_usd_t, brent_usd, eurusd,
    gasoil_eur (EUR/t), brent_eur (EUR/bbl), food_commo (indice EUR), nonfood_commo."""
    h = pd.DataFrame({
        "ttf": db["legacy_gas_1m"], "power_fr": db["legacy_power_fr"], "power_de": db["legacy_power_de"],
        "gasoil_usd_t": db["legacy_gasoil_1m"] * 7.443, "brent_usd": db["legacy_crude_1m"],
        "eurusd": db["legacy_eurusd"], "food_commo": db["ecb_commodity_import_food_index"],
        "nonfood_commo": db["ecb_commodity_import_nonfood_index"],
    })
    for m, row in mkt["recent_months"].items():
        if m.startswith("_"):
            continue
        p = pd.Period(m, "M")
        for k, v in row.items():
            if k.startswith("_"):
                continue
            h.loc[p, k] = v
    h = h.sort_index()
    h[["food_commo", "nonfood_commo"]] = h[["food_commo", "nonfood_commo"]].ffill()
    h["gasoil_eur"] = h.gasoil_usd_t / h.eurusd
    h["brent_eur"] = h.brent_usd / h.eurusd
    return h


def yoy(s: pd.Series) -> pd.Series:
    return 100 * (s / s.shift(12) - 1)


def dlog(s: pd.Series) -> pd.Series:
    return 100 * np.log(s / s.shift(1))
