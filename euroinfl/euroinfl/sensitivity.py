"""Sensibilités : « si tel input bouge de X %, que deviennent les prévisions ? »

Deux lectures complémentaires
1. Choc sur les FIXINGS (bp de glissement annuel) : on relance tout le modèle avec la courbe de
   l'input multipliée par (1 + choc) à partir du premier mois non observé, et on compare au central.
   Tous les canaux sont inclus (direct énergie + indirect via PPI → alimentation, biens, services).
2. Profil de PASS-THROUGH (élasticité cumulée) : variation en % du NIVEAU de chaque indice de détail
   divisée par la taille du choc, mois après mois. 0,40 après 6 mois = 40 % du choc est passé.
Le modèle étant (quasi) log-linéaire, les effets sont proportionnels au choc et additifs entre inputs.
"""
from __future__ import annotations
import pandas as pd
from .data import GEOS, ENERGY_ITEMS, CORE
from .pipeline import FIXINGS

SHOCKS = {
    # clé : (libellé, kwargs forecast)
    "ttf_power": ("Gaz TTF +10 % (avec électricité de gros entraînée)", {"ttf": 1.10, "_power": True}),
    "ttf_only": ("Gaz TTF +10 % (électricité de gros inchangée)", {"ttf": 1.10}),
    "power_de": ("Électricité de gros Allemagne +10 %", {"power_de": 1.10}),
    "power_fr": ("Électricité de gros France +10 %", {"power_fr": 1.10}),
    "gasoil": ("Gasoil ICE +10 % (en $)", {"gasoil_usd_t": 1.10}),
    "eurusd": ("Euro +10 % contre dollar", {"eurusd": 1.10}),
    "food_commo": ("Matières premières alimentaires +10 %", {"food_commo": 1.10}),
    "nonfood_commo": ("Matières premières industrielles +10 %", {"nonfood_commo": 1.10}),
    "wages": ("Salaires négociés +1 pp par an", {"wage_pp": 1.0}),
}
ITEMS = ["TOT_X_TBC", "NRG", *ENERGY_ITEMS, *CORE]


def _shocks(model, spec):
    sh = {k: v for k, v in spec.items() if not k.startswith("_")}
    if spec.get("_power"):
        for p, b in model.power_link.items():
            sh[p] = spec["ttf"] ** b
    return sh


def run_all(model, scenario="central"):
    base = model.forecast(scenario)
    fixing_rows, level_rows = [], []
    for key, (label, spec) in SHOCKS.items():
        f = model.forecast(scenario, shocks=_shocks(model, spec))
        size = 10.0 if key != "wages" else None
        for g in GEOS:
            for it in ITEMS:
                d = (f.yoy(g, it) - base.yoy(g, it)) * 100      # bp
                for t, v in d.items():
                    fixing_rows.append({"shock": key, "label": label, "geo": g, "item": it, "fixing": str(t), "bp": v})
                lb, ls = base.levels[g][it].loc[FIXINGS], f.levels[g][it].loc[FIXINGS]
                for k, t in enumerate(FIXINGS):
                    pct = 100 * (ls[t] / lb[t] - 1)
                    level_rows.append({"shock": key, "geo": g, "item": it, "fixing": str(t), "months": k,
                                       "level_pct": pct, "elasticity": pct / size if size else None})
    return base, pd.DataFrame(fixing_rows), pd.DataFrame(level_rows)


def passthrough_tables(model):
    """Élasticités estimées (régime actuel vs ancien) pour chaque équation énergie et core."""
    rows = []
    for g in GEOS:
        for it, e in model.eq[g].items():
            # 'reset' : le terme de révision transmet une part beta de la variation du gros entre deux révisions,
            # il s'additionne donc aux élasticités 'dlog' dans le pass-through cumulé
            drivers = sorted({b.driver for b in e.buckets if b.kind in ("dlog", "reset")})
            for d in drivers:
                cur, old = e.passthrough(d, "current"), e.passthrough(d, "old")
                rows.append({"geo": g, "item": it, "driver": d, "rho": cur["rho"],
                             "sum_current": cur["sum"], "long_run_current": cur["long_run"],
                             "sum_old_regime": old["sum"] if e.regime_start else None,
                             "buckets": "; ".join(f"{l}={v:.3f}" for l, v in cur["buckets"]),
                             "r2": e.stats["r2"], "sigma": e.stats["sigma"], "n": e.stats["n"]})
            for b in e.buckets:
                if b.kind == "level":
                    rows.append({"geo": g, "item": it, "driver": b.driver, "rho": e.coef.get("rho", 0),
                                 "sum_current": e.coef[b.label], "long_run_current": None, "sum_old_regime": None,
                                 "buckets": f"{b.label}={e.coef[b.label]:.3f}", "r2": e.stats["r2"],
                                 "sigma": e.stats["sigma"], "n": e.stats["n"]})
    for k, e in model.stage1.items():
        for d in sorted({b.driver for b in e.buckets}):
            cur = e.passthrough(d)
            rows.append({"geo": "EA (étage 1)", "item": k, "driver": d, "rho": cur["rho"], "sum_current": cur["sum"],
                         "long_run_current": cur["long_run"], "sum_old_regime": None,
                         "buckets": "; ".join(f"{l}={v:.3f}" for l, v in cur["buckets"]),
                         "r2": e.stats["r2"], "sigma": e.stats["sigma"], "n": e.stats["n"]})
    return pd.DataFrame(rows)
