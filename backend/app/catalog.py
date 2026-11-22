"""Référentiels : import du moteur, libellés FR, chocs, scénarios, unités.

Les libellés des sous-indices, pays, chocs et scénarios viennent du moteur (data.LABELS, data.COUNTRY_NAMES,
sensitivity.SHOCKS, pipeline.GASOIL_SCENARIOS). Seuls les libellés des drivers et des curseurs du simulateur
sont définis ici (ils n'existent pas dans le moteur).
"""

from __future__ import annotations

import sys

from .config import ENGINE_DIR

if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))

from euroinfl import pipeline as P  # noqa: E402
from euroinfl import sensitivity as S  # noqa: E402
from euroinfl.data import CORE, COUNTRY_NAMES, ENERGY_ITEMS, GEOS, LABELS  # noqa: E402

TOP_ITEMS = ["NRG", *CORE]  # composantes qui portent une contribution (pp)
ALL_ITEMS = ["TOT_X_TBC", "NRG", *ENERGY_ITEMS, *CORE]
FIXINGS = [str(t) for t in P.FIXINGS]
LAST_OBS = str(P.LAST_OBS)
REGIME_START = P.REG
# plan §6 : fixings au-delà de h+10 = « indicatif ». h+k suit la convention des fixings de marché (h+0 = premier fixing),
# notre h commence à 1 : h+10 = h 11 (Sep-27) ; indicatifs = h ≥ 12 (Oct-27 → Dec-27).
INDICATIVE_AFTER_H = 11
CHAIN_RESIDUAL = "CHAIN_RESIDUAL"

_MONTHS_FR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def fixing_label(period: str) -> str:
    """'2026-11' -> 'Nov-26' (convention de marché, CLAUDE.md règle 3)."""
    y, m = period.split("-")
    return f"{_MONTHS_FR[int(m) - 1]}-{y[2:]}"


def item_level(code: str) -> str:
    if code == "TOT_X_TBC":
        return "total"
    if code in ENERGY_ITEMS:
        return "energy_sub"
    return "component"


DRIVER_LABELS = {
    "ttf": ("Gaz TTF", "€/MWh"),
    "power_de": ("Électricité de gros Allemagne", "€/MWh"),
    "power_fr": ("Électricité de gros France", "€/MWh"),
    "gasoil_usd_t": ("Gasoil ICE", "$/t"),
    "gasoil_eur": ("Gasoil ICE en euros", "€/t"),
    "brent_usd": ("Brent", "$/bbl"),
    "eurusd": ("EUR/USD", "$ pour 1 €"),
    "food_commo": ("Matières premières alimentaires (BCE)", "indice"),
    "nonfood_commo": ("Matières premières industrielles (BCE)", "indice"),
    "ppi_energy": ("PPI énergie (zone euro)", "indice"),
    "ppi_food": ("PPI alimentaire (zone euro, rythme lissé)", "indice"),
    "ppi_interm": ("PPI biens intermédiaires (zone euro)", "indice"),
    "wage_m": ("Salaires négociés (g.a. / 12)", "%/mois"),
}

# Taille et unité des chocs pré-calculés (sensitivity.run_all)
SHOCK_SIZE = {k: (1.0, "pp/an") if k == "wages" else (10.0, "%") for k in S.SHOCKS}

# Curseurs du simulateur → clés du moteur (DATA_CONTRACT §12). Utilisé par /api/meta, puis /api/simulate.
SIM_INPUTS = [
    {"key": "ttf", "label": "Gaz TTF", "unit": "%", "engine_key": "ttf", "kind": "mult"},
    {
        "key": "gasoil",
        "label": "Gasoil ICE (en $)",
        "unit": "%",
        "engine_key": "gasoil_usd_t",
        "kind": "mult",
    },
    {
        "key": "brent",
        "label": "Brent (scénarios Brent + crack)",
        "unit": "%",
        "engine_key": "brent_usd",
        "kind": "mult",
    },
    {"key": "eurusd", "label": "Euro contre dollar", "unit": "%", "engine_key": "eurusd", "kind": "mult"},
    {
        "key": "power_de",
        "label": "Électricité de gros Allemagne",
        "unit": "%",
        "engine_key": "power_de",
        "kind": "mult",
    },
    {
        "key": "power_fr",
        "label": "Électricité de gros France",
        "unit": "%",
        "engine_key": "power_fr",
        "kind": "mult",
    },
    {
        "key": "food_commo",
        "label": "Matières premières alimentaires",
        "unit": "%",
        "engine_key": "food_commo",
        "kind": "mult",
    },
    {
        "key": "nonfood_commo",
        "label": "Matières premières industrielles",
        "unit": "%",
        "engine_key": "nonfood_commo",
        "kind": "mult",
    },
    {
        "key": "wages_pp",
        "label": "Salaires négociés",
        "unit": "pp/an",
        "engine_key": "wage_pp",
        "kind": "add",
    },
]

# Unités par route (meta.units)
UNITS = {
    "yoy": "%",
    "BU": "%",
    "STAT": "%",
    "COMBINE": "%",
    "market": "%",
    "gap_bp": "bp",
    "contrib_pp": "pp",
    "bp": "bp",
    "level_pct": "% de niveau",
    "elasticity": "% de niveau par % de choc",
    "rmse": "pp",
    "bias": "pp",
    "err": "pp",
    "index": "indice 2025 = 100",
    "gasoil_usd_t": "$/t",
    "base": "%",
    "shocked": "%",
    "delta_bp": "bp",
}

__all__ = [
    "P",
    "S",
    "GEOS",
    "CORE",
    "ENERGY_ITEMS",
    "LABELS",
    "COUNTRY_NAMES",
    "TOP_ITEMS",
    "ALL_ITEMS",
    "FIXINGS",
    "LAST_OBS",
    "REGIME_START",
    "INDICATIVE_AFTER_H",
    "CHAIN_RESIDUAL",
    "fixing_label",
    "item_level",
    "DRIVER_LABELS",
    "SHOCK_SIZE",
    "SIM_INPUTS",
    "UNITS",
]
