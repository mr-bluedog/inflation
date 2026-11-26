"""Exports pour le dashboard (aucune logique de modèle ici) : trajectoires des inputs de marché telles que
le moteur les utilise, pour chacun des scénarios énergie (pipeline.build_drivers).

Convention : la valeur du mois M est le niveau utilisé par le moteur pour M (prix de gros = contrat M+1 coté
pendant M ; prix à la pompe = moyenne des relevés hebdomadaires du mois).
"""
from __future__ import annotations
import pandas as pd

from . import pipeline as P
from .data import GEOS

# inputs exportés, dans l'ordre d'affichage (groupe, clé)
MARKET_DRIVERS = [
    ("petrole", "brent_usd"), ("petrole", "gasoil_usd_t"), ("petrole", "gasoil_eur"), ("petrole", "eurusd"),
    *[("pompe", f"wob_{p}_{g}") for g in GEOS for p in ("e95", "dsl", "heat")],
    ("gaz_elec", "ttf"), ("gaz_elec", "power_de"), ("gaz_elec", "power_fr"),
]
DB_LAST = pd.Period("2026-07", "M")   # dernier mois de la base macro (prix de gros)


def market_paths(model: P.Model, start: str = "2025-01", end: str = "2027-12") -> dict:
    """{months, last_market_month, wob_last_week, drivers: [{key, group, origin[]}], paths: {scenario: {key: [..]}}}.
    origin par mois : 'base' (base de données), 'recent' (mois récents de market_inputs), 'observe' (prix à la
    pompe relevés), 'projection' (courbes à terme, règle de scénario ou prolongement)."""
    months = pd.period_range(start, end, freq="M")
    paths, last_mkt, wob_month = {}, None, None
    for sc in P.GASOIL_SCENARIOS:
        X, last_mkt = P.build_drivers(model.db, model.mkt, sc)
        paths[sc] = {k: [None if pd.isna(v) else round(float(v), 4) for v in X[k].reindex(months)]
                     for _, k in MARKET_DRIVERS}
    h = P.wholesale_history(model.db, model.mkt)
    wob = h.attrs.get("wob") or {}
    if wob.get("last_date") is not None:
        wob_month = pd.Period(wob["last_date"], "M")
    drivers = []
    for group, k in MARKET_DRIVERS:
        origin = []
        for m in months:
            if group == "pompe":
                origin.append("observe" if wob_month is not None and m <= wob_month else "projection")
            elif m <= DB_LAST:
                origin.append("base")
            elif m <= last_mkt:
                origin.append("recent")
            else:
                origin.append("projection")
        drivers.append({
            "key": k, "group": group, "origin": origin,
            "scenario_dependent": any(paths[s][k] != paths["central"][k] for s in paths),
        })
    return {
        "months": [str(m) for m in months],
        "last_market_month": str(last_mkt),
        "wob_last_week": wob["last_date"].date().isoformat() if wob.get("last_date") is not None else None,
        "drivers": drivers,
        "paths": paths,
    }
