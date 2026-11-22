"""Backtest pseudo temps réel (origines glissantes, ré-estimation à chaque origine).

À chaque origine T (dernier HICP connu) :
  - les équations sont ré-estimées avec les données ≤ T (PPI connus jusqu'à T-2, retard de publication) ;
  - les drivers futurs sont fixés selon un mode :
      'rw'      : prix de gros figés au dernier niveau (proxy réaliste des futures, aucune info future) ;
      'perfect' : prix de gros réalisés (mesure la qualité de la TRANSMISSION, pas de la prévision des prix) ;
  - on prévoit T+1 … T+12 et on compare le glissement annuel au réalisé.
h1 = premier mois non publié (« h+0 » dans la convention des fixings de marché).
Modèles comparés : BU (structurel), STAT (saisonnalité + AR, sans driver), NAÏF (glissement annuel inchangé).
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from . import pipeline as P
from .data import GEOS, ENERGY_ITEMS, CORE, wholesale_history
from .engine import Equation


class StatModel(P.Model):
    """Challenger statistique : chaque composante = saisonnalité mensuelle + AR(1), sans driver."""
    def fit(self, X=None, end=None):
        end = end or self.last_obs
        self.stage1 = P.stage1_equations()
        for k, e in self.stage1.items():
            e.fit(X[k], X, end=min(end, X[k].last_valid_index()))
        self.eq = {}
        for g in GEOS:
            eqs = {k: Equation(f"{g} {k} stat", k, [], ar=True,
                               exclude=(("2020-03", "2021-06"),) if k in CORE else ())
                   for k in [*ENERGY_ITEMS, *CORE]}
            for k, e in eqs.items():
                e.fit(self.H[g][k], X, end=end)
            self.eq[g] = eqs
        self.power_link = {}
        return self


def drivers_at_origin(db, T: pd.Period, mode="rw"):
    h = wholesale_history(db, {"recent_months": {}})
    idx = pd.period_range("2005-01", T + 14, freq="M")
    X = h.reindex(idx)
    fut = idx[idx > T]
    cols = ["ttf", "power_fr", "power_de", "gasoil_usd_t", "brent_usd", "eurusd", "food_commo", "nonfood_commo"]
    if mode == "rw":
        for c in cols:
            X.loc[fut, c] = X.loc[T, c]
    X["gasoil_eur"] = X.gasoil_usd_t / X.eurusd
    X["brent_eur"] = X.brent_usd / X.eurusd
    w = (db["legacy_wage_tracker"] / 12).reindex(idx)
    w.loc[T:] = w.loc[:T - 1].dropna().iloc[-1]
    X["wage_m"] = w
    lag = T - 2
    X["ppi_energy"] = db["es_ppi_energy_index"].reindex(idx).loc[:lag].reindex(idx)
    X["ppi_interm"] = db["es_ppi_intermediate_goods_index"].reindex(idx).loc[:lag].reindex(idx)
    fm = (db["es_ppi_food_yoy"] / 12).reindex(idx).loc[:lag].reindex(idx)
    X["ppi_food"] = np.exp(fm.fillna(0).cumsum() / 100).where(fm.notna())
    return X


def run(db, H, W, origins, mode="rw", model_cls=P.Model, items=("TOT_X_TBC",)):
    rows = []
    for T in origins:
        Ht = {g: H[g].loc[:T] for g in GEOS}
        X = drivers_at_origin(db, T, mode)
        m = model_cls(db=db, mkt={"recent_months": {}}, hicp=Ht, weights=W, last_obs=T)
        m.fit(X=X, end=T)
        f = m.forecast(X=X, H=Ht, last_obs=T, end=T + 12)
        for g in GEOS:
            for it in items:
                lv = f.levels[g][it]
                act = H[g][it]
                for h in range(1, 13):
                    t = T + h
                    if t not in act.index or pd.isna(act.get(t)):
                        continue
                    fc = 100 * (lv[t] / lv[t - 12] - 1)
                    ac = 100 * (act[t] / act[t - 12] - 1)
                    rows.append({"origin": T, "geo": g, "item": it, "h": h, "fc": fc, "act": ac, "err": fc - ac})
    return pd.DataFrame(rows)


def naive(H, origins, items=("TOT_X_TBC",)):
    rows = []
    for T in origins:
        for g in GEOS:
            for it in items:
                s = H[g][it]
                y0 = 100 * (s[T] / s[T - 12] - 1)
                for h in range(1, 13):
                    t = T + h
                    if t in s.index:
                        ac = 100 * (s[t] / s[t - 12] - 1)
                        rows.append({"origin": T, "geo": g, "item": it, "h": h, "fc": y0, "act": ac, "err": y0 - ac})
    return pd.DataFrame(rows)


def rmse_table(df):
    return df.groupby(["geo", "item", "h"])["err"].apply(lambda e: float(np.sqrt(np.mean(e ** 2)))).unstack("h")
