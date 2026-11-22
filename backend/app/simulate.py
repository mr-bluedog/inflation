"""Recalcul exact des chocs par le moteur (plan §4.3) : Model.forecast(scenario, shocks=…).

Le modèle est ajusté une seule fois (≈ 0,2 s) et gardé en mémoire ; les prévisions de base sont mises en cache
par scénario. Un verrou sérialise les appels au moteur. Aucune logique du modèle n'est modifiée ici : on ne fait
que traduire les curseurs de l'interface en arguments du moteur (DATA_CONTRACT §12).
"""

from __future__ import annotations

import threading
from functools import lru_cache

import pandas as pd

from . import config
from .catalog import ALL_ITEMS, GEOS, SIM_INPUTS, P

_LOCK = threading.Lock()
SIM_KEYS = {x["key"]: x for x in SIM_INPUTS}
# bornes des curseurs : choc multiplicatif en % (> −90 %), salaires en pp/an
BOUNDS = {"mult": (-90.0, 300.0), "add": (-5.0, 5.0)}


@lru_cache(maxsize=1)
def model():
    from euroinfl.data import load_user_db

    db = load_user_db(config.ENGINE_DATA_DIR / "euro_inflation_database_long.csv")
    return P.Model(db=db).fit()


def validate(shocks: dict[str, float]) -> list[str]:
    errs = []
    for k, v in shocks.items():
        inp = SIM_KEYS.get(k)
        if inp is None:
            errs.append(f"curseur inconnu : {k}")
            continue
        lo, hi = BOUNDS[inp["kind"]]
        if not lo <= v <= hi:
            errs.append(f"{k} = {v} hors bornes [{lo}, {hi}] ({inp['unit']})")
    return errs


def engine_shocks(
    shocks: dict[str, float], link_power: bool, power_link: dict[str, float]
) -> dict[str, float]:
    """Curseurs (%, pp/an) → arguments du moteur : multiplicateurs de niveau, salaires additifs en pp/an.
    « Électricité entraînée » : power_x ×= (multiplicateur TTF) ** élasticité estimée (power_link)."""
    out: dict[str, float] = {}
    for k, v in shocks.items():
        if v == 0:
            continue
        inp = SIM_KEYS[k]
        out[inp["engine_key"]] = 1 + v / 100 if inp["kind"] == "mult" else float(v)
    if link_power and "ttf" in out:
        for p, b in power_link.items():
            out[p] = out.get(p, 1.0) * out["ttf"] ** b
    return out


def _yoy_table(f) -> pd.DataFrame:
    rows = [
        {"geo": g, "item": it, "fixing": str(t), "yoy": v}
        for g in GEOS
        for it in ALL_ITEMS
        for t, v in f.yoy(g, it).items()
    ]
    return pd.DataFrame(rows)


@lru_cache(maxsize=8)
def _base(scenario: str) -> pd.DataFrame:
    return _yoy_table(model().forecast(scenario))


def simulate(
    scenario: str, shocks: dict[str, float], link_power: bool
) -> tuple[dict[str, float], list[dict]]:
    with _LOCK:
        m = model()
        eng = engine_shocks(shocks, link_power, m.power_link)
        base = _base(scenario)
        shocked = _yoy_table(m.forecast(scenario, shocks=eng)) if eng else base
    df = base.rename(columns={"yoy": "base"}).merge(
        shocked.rename(columns={"yoy": "shocked"}), on=["geo", "item", "fixing"]
    )
    df["delta_bp"] = (df.shocked - df.base) * 100
    return eng, df.to_dict(orient="records")
