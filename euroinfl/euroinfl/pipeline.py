"""Pipeline complet : drivers → étage 1 (prix de production) → étage 2 (prix de détail par pays)
→ agrégation (énergie, HICPxT) → prévisions, scénarios et chocs.

Lecture rapide de la chaîne causale
    Gros (TTF, électricité FR/DE, gasoil, matières premières)            [marché / hypothèses]
      │
      ├─► Énergie de détail (carburants, fioul, gaz, électricité)        [effet DIRECT, 0-24 mois]
      │
      └─► Étage 1 : PPI énergie ─► PPI alimentaire, PPI biens intermédiaires
              │
              └─► Étage 2 : alimentation, biens (NEIG), services        [effets INDIRECTS, 3-15 mois]
      Salaires ─► services
Toutes les équations sont des objets engine.Equation (voir ce module pour la forme générale).
"""
from __future__ import annotations
import copy
import numpy as np
import pandas as pd
from .data import (GEOS, CORE, ENERGY_ITEMS, load_hicp, load_weights, load_user_db,
                   load_market_inputs, wholesale_history)
from .engine import Equation, Bucket

LAST_OBS = pd.Period("2026-10", "M")      # dernier HICP publié (Eurostat, 18/11/2026)
HORIZON_END = pd.Period("2027-12", "M")
FIXINGS = pd.period_range("2026-11", "2027-12", freq="M")
GASOIL_SCENARIOS = {
    "central": "Central · niveau actuel tenu 3 mois puis convergence en 6 pas vers la courbe ICE",
    "flat": "Front constant · le prix de gros actuel est tenu sur tout l'horizon",
    "full": "Courbe ICE complète · chaque mois au prix de son contrat",
    "flat3_trend": "3 mois plats puis convergence lisse (identique au central ici, sans WOB)",
    "brent_crack": "Brent + crack initial, Brent figé après 3 contrats",
    "brent_crack_full": "Brent futures complets + crack initial constant",
}

# --------------------------------------------------------------------------------------
# 1. Spécification des équations
# --------------------------------------------------------------------------------------
REG = "2023-01"   # début du régime « post-crise » (fin des boucliers, indexation de marché)

# Réglages globaux (choisis par backtest, cf. README « Choix de calibration »)
CONFIG = {
    # Dérive de fond imposée aux prix de détail de l'énergie (%/mois) hors variations du prix de gros :
    # coûts de réseau, marges, indexation des accises. None = estimée librement (déconseillé : la
    # moyenne historique contient la crise 2021-22 et biaise la prévision vers le haut).
    "energy_drift": {"CP0722": 0.10, "CP0453": 0.10, "CP0452": 0.15, "CP0451": 0.15},
    # Demi-vie (mois) de la pondération des observations pour les composantes core (None = égale).
    "half_life_core": 60,
    "half_life_energy": None,
}


def gas_buckets(geo):
    if geo == "IT":   # marché libre indexé mensuellement (PSV) : transmission rapide
        return [Bucket("ttf", 0, 1, True), Bucket("ttf", 2, 4, True), Bucket("ttf", 5, 11, True)]
    return [Bucket("ttf", 0, 2, True), Bucket("ttf", 3, 11, True), Bucket("ttf", 12, 23, True)]


ELEC_DRIVER = {"EA": "power_de", "IT": "ttf", "FR": "power_fr", "DE": "power_de", "ES": "power_de"}


def energy_equations(geo):
    d = ELEC_DRIVER[geo]
    eqs = {
        "CP0722": Equation(f"{geo} carburants", "CP0722",
                           [Bucket("gasoil_eur", 0, 0), Bucket("gasoil_eur", 1, 1), Bucket("gasoil_eur", 2, 3)], ar=False),
        "CP0453": Equation(f"{geo} fioul", "CP0453",
                           [Bucket("gasoil_eur", 0, 0), Bucket("gasoil_eur", 1, 2)], ar=False),
        "CP0452": Equation(f"{geo} gaz", "CP0452", gas_buckets(geo), regime_start=REG),
        "CP0451": Equation(f"{geo} électricité", "CP0451",
                           [Bucket(d, 0, 2, True), Bucket(d, 3, 11, True), Bucket(d, 12, 23, True)], regime_start=REG),
    }
    for k, e in eqs.items():
        e.drift = CONFIG["energy_drift"].get(k)
        e.half_life = CONFIG["half_life_energy"]
    return eqs


def core_equations(geo):
    eqs = {
        "FOOD_P_X_TBC": Equation(f"{geo} alim. transformée", "FOOD_P_X_TBC",
                                 [Bucket("ppi_food", 1, 4), Bucket("ppi_energy", 3, 12)]),
        "FOOD_NP": Equation(f"{geo} alim. non transformée", "FOOD_NP", [Bucket("ppi_energy", 1, 12)]),
        "IGD_NNRG": Equation(f"{geo} biens (NEIG)", "IGD_NNRG",
                             [Bucket("ppi_interm", 1, 6), Bucket("ppi_interm", 7, 15)], exclude=(("2020-03", "2020-12"),)),
        "SERV": Equation(f"{geo} services", "SERV",
                         [Bucket("wage_m", 1, 6, kind="level"), Bucket("ppi_energy", 3, 15)], easter=True,
                         exclude=(("2020-03", "2021-06"),)),
    }
    for e in eqs.values():
        e.half_life = CONFIG["half_life_core"]
    return eqs


def stage1_equations():
    """Étage 1 (zone euro) : prix de production."""
    return {
        "ppi_energy": Equation("PPI énergie", "ppi_energy",
                               [Bucket("ttf", 0, 0), Bucket("ttf", 1, 2), Bucket("power_de", 0, 1), Bucket("gasoil_eur", 0, 1)],
                               start="2008-02"),
        "ppi_food": Equation("PPI alimentaire (rythme lissé)", "ppi_food",
                             [Bucket("food_commo", 0, 2), Bucket("food_commo", 3, 8), Bucket("ppi_energy", 0, 5)], start="2008-02"),
        "ppi_interm": Equation("PPI biens intermédiaires", "ppi_interm",
                               [Bucket("ppi_energy", 0, 2), Bucket("ppi_energy", 3, 8), Bucket("nonfood_commo", 0, 3)], start="2008-02"),
    }


# Élasticité contemporaine électricité de gros / gaz (prix marginal fixé par les centrales gaz),
# estimée 2010-2026 sur données mensuelles (cf. Model.fit_power_link). Sert uniquement aux chocs
# « gaz avec répercussion sur l'électricité de gros ».
POWER_LINK_DRIVERS = ["power_de", "power_fr"]


# --------------------------------------------------------------------------------------
# 2. Construction des drivers (historique + futur)
# --------------------------------------------------------------------------------------
def build_drivers(db, mkt, scenario="central", shocks: dict | None = None):
    """Retourne un DataFrame mensuel 2005 → 2028 de tous les drivers, futur inclus.
    shocks : {driver: multiplicateur de niveau appliqué à partir du 1er mois non observé}."""
    shocks = shocks or {}
    h = wholesale_history(db, mkt)
    idx = pd.period_range("2005-01", "2028-03", freq="M")
    X = h.reindex(idx)
    last_mkt = max(pd.Period(m, "M") for m in mkt["recent_months"] if not m.startswith("_"))
    fx = mkt["eurusd"]
    fut = pd.period_range(last_mkt + 1, idx[-1], freq="M")
    curves = {k: {pd.Period(m, "M"): v for m, v in c.items()} for k, c in mkt["curves"].items()}

    def contract(name, p):   # niveau du mois M = contrat de livraison M+1 ; queue tenue plate
        c = curves[name]
        q = p + 1
        if q in c:
            return c[q]
        return c[max(c)] if q > max(c) else c[min(c)]

    for p in fut:
        for k in ["ttf", "power_fr", "power_de", "brent_usd"]:
            X.loc[p, k] = contract(k, p)
        X.loc[p, "eurusd"] = fx
    # Gasoil : 6 scénarios de courbe (cf. GASOIL_SCENARIOS)
    g0 = X.loc[last_mkt, "gasoil_usd_t"]
    b0 = X.loc[last_mkt, "brent_usd"]
    crack = g0 - 7.443 * b0
    for i, p in enumerate(fut, start=1):
        curve = contract("gasoil_usd_t", p)
        if scenario in ("central", "flat3_trend"):
            if i <= 2:          # mois en cours + 2 suivants tenus au niveau actuel (≈ WOB plat 3M)
                v = g0
            else:
                a = min((i - 2) / 6, 1.0)
                v = (1 - a) * g0 + a * curve
        elif scenario == "flat":
            v = g0
        elif scenario == "full":
            v = curve
        elif scenario == "brent_crack":
            v = 7.443 * contract("brent_usd", last_mkt + min(i, 3)) + crack
        elif scenario == "brent_crack_full":
            v = 7.443 * contract("brent_usd", p) + crack
        else:
            raise ValueError(scenario)
        X.loc[p, "gasoil_usd_t"] = v
    # Matières premières : hypothèse de variation mensuelle constante
    a = mkt["assumptions"]
    for col, key in [("food_commo", "food_commo_monthly_pct"), ("nonfood_commo", "nonfood_commo_monthly_pct")]:
        last = X[col].last_valid_index()
        for p in pd.period_range(last + 1, idx[-1], freq="M"):
            X.loc[p, col] = X.loc[p - 1, col] * (1 + a[key] / 100)
    # Salaires : rythme mensuel = croissance a/a / 12
    w = db["legacy_wage_tracker"].reindex(idx) / 12
    lw = w.last_valid_index()
    wg = a.get("wage_growth_yoy")
    w.loc[lw + 1:] = (w[lw] * 12 if wg is None else wg) / 12   # défaut : dernier tracker BCE
    X["wage_m"] = w
    # Chocs (multiplicatifs, permanents, sur les mois non observés)
    for k, mult in shocks.items():
        if k == "eurusd":
            X.loc[fut, "eurusd"] *= mult
        elif k == "wage_pp":
            X.loc[lw + 1:, "wage_m"] += mult / 12
        else:
            X.loc[fut, k] *= mult
    X["gasoil_eur"] = X.gasoil_usd_t / X.eurusd
    X["brent_eur"] = X.brent_usd / X.eurusd
    # Séries amont observées (étage 1), complétées plus loin par simulation
    X["ppi_energy"] = db["es_ppi_energy_index"].reindex(idx)
    X["ppi_interm"] = db["es_ppi_intermediate_goods_index"].reindex(idx)
    fm = (db["es_ppi_food_yoy"] / 12).reindex(idx)        # glissement annuel → rythme mensuel
    X["ppi_food"] = np.exp(fm.fillna(0).cumsum() / 100).where(fm.notna())
    return X, last_mkt


# --------------------------------------------------------------------------------------
# 3. Agrégation en indices chaînés (décembre)
# --------------------------------------------------------------------------------------
def chain_aggregate(levels: dict, weights: dict, parent_obs: pd.Series, last_obs: pd.Period, end: pd.Period):
    """Indice agrégé = Π annuel des Σ_k w_k · I_k,t / I_k,déc(N-1). Dans l'année du dernier point
    observé, l'agrégat est recalé pour coïncider avec l'indice publié (écart = « autres » postes)."""
    out = parent_obs.copy().reindex(pd.period_range(parent_obs.index[0], end, freq="M"))
    t = last_obs + 1
    while t <= end:
        dec = pd.Period(f"{t.year - 1}-12", "M")
        rel = sum(w * levels[k][t] / levels[k][dec] for k, w in weights.items())
        if t.year == last_obs.year:
            rel_T = sum(w * levels[k][last_obs] / levels[k][dec] for k, w in weights.items())
            out[t] = parent_obs[last_obs] * rel / rel_T
        else:
            out[t] = out[dec] * rel
        t += 1
    return out


# --------------------------------------------------------------------------------------
# 4. Modèle
# --------------------------------------------------------------------------------------
class Model:
    def __init__(self, db=None, mkt=None, hicp=None, weights=None, last_obs=LAST_OBS):
        self.db = db if db is not None else load_user_db()
        self.mkt = mkt if mkt is not None else load_market_inputs()
        self.H = hicp if hicp is not None else load_hicp()
        self.W = weights if weights is not None else load_weights(2026)
        self.last_obs = last_obs
        self.eq = {}

    def fit(self, X=None, end=None):
        end = end or self.last_obs
        X = X if X is not None else build_drivers(self.db, self.mkt)[0]
        self.stage1 = stage1_equations()
        for k, e in self.stage1.items():
            e.fit(X[k], X, end=min(end, X[k].last_valid_index()))
        self.eq = {}
        for g in GEOS:
            eqs = {**energy_equations(g), **core_equations(g)}
            for k, e in eqs.items():
                e.fit(self.H[g][k], X, end=end)
            self.eq[g] = eqs
        self.power_link = {}
        for p in POWER_LINK_DRIVERS:
            e = Equation(f"lien {p}/TTF", p, [Bucket("ttf", 0, 0)], ar=False, start="2010-02")
            e.fit(X[p], X, end=pd.Period("2026-07", "M"))
            self.power_link[p] = e.coef["ttf[0-0]"]
        return self

    # ----- prévision -----
    def forecast(self, scenario="central", shocks=None, end=HORIZON_END, X=None, H=None, last_obs=None):
        last_obs = last_obs or self.last_obs
        H = H or self.H
        if X is None:
            X, _ = build_drivers(self.db, self.mkt, scenario, shocks)
        X = X.copy()
        # Étage 1 : prolonger les séries amont au-delà de leur dernier point publié
        for k in ["ppi_energy", "ppi_food", "ppi_interm"]:
            s = X[k]
            lv = s.last_valid_index()
            X[k] = self.stage1[k].simulate(s.loc[:lv], X, lv + 1, X.index[-1])
        res = {}
        for g in GEOS:
            lv = {}
            for k, e in self.eq[g].items():
                lv[k] = e.simulate(H[g][k].loc[:last_obs], X, last_obs + 1, end)
            ew = {k: self.W[g]["energy"][k] for k in ENERGY_ITEMS}
            ew = {k: v / sum(ew.values()) for k, v in ew.items()}   # « autre énergie » suit l'énergie modélisée
            nrg = chain_aggregate({k: lv[k] for k in ENERGY_ITEMS}, ew,
                                  H[g]["NRG"].loc[:last_obs], last_obs, end)
            # « autre énergie » (solides, chaleur) : poids résiduel, indice supposé suivre l'énergie modélisée
            lv["NRG"] = nrg
            top = self.W[g]["top"]
            xt = chain_aggregate({k: lv[k] for k in top}, top, H[g]["TOT_X_TBC"].loc[:last_obs], last_obs, end)
            lv["TOT_X_TBC"] = xt
            res[g] = pd.DataFrame(lv)
        return Forecast(res, X, self, scenario)

    def shocked(self, driver, pct=10.0, scenario="central", with_power=False):
        sh = {driver: 1 + pct / 100}
        if driver == "ttf" and with_power:
            for p, b in self.power_link.items():
                sh[p] = (1 + pct / 100) ** b
        return self.forecast(scenario, shocks=sh)


class Forecast:
    def __init__(self, levels: dict, X: pd.DataFrame, model: Model, scenario: str):
        self.levels, self.X, self.model, self.scenario = levels, X, model, scenario

    def yoy(self, geo, item="TOT_X_TBC") -> pd.Series:
        s = self.levels[geo][item]
        return (100 * (s / s.shift(12) - 1)).loc[FIXINGS]

    def table(self, item="TOT_X_TBC") -> pd.DataFrame:
        return pd.DataFrame({g: self.yoy(g, item) for g in GEOS})

    def components(self, geo) -> pd.DataFrame:
        cols = ["TOT_X_TBC", "NRG", *ENERGY_ITEMS, *CORE]
        return pd.DataFrame({c: self.yoy(geo, c) for c in cols})

    def contributions(self, geo) -> pd.DataFrame:
        """Contribution approximative de chaque composante au glissement annuel (pp) = poids × a/a."""
        top = self.model.W[geo]["top"]
        c = pd.DataFrame({k: top[k] * self.yoy(geo, k) for k in top})
        c["résidu de chaînage"] = self.yoy(geo) - c.sum(axis=1)
        return c
