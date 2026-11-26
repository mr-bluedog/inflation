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
from . import wob

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
    # Carburants et fioul : 0, toute la tendance (taxes, marges) est déjà dans le prix à la pompe WOB.
    "energy_drift": {"CP0722": 0.0, "CP0453": 0.0, "CP0452": 0.15, "CP0451": 0.15},
    # Demi-vie (mois) de la pondération des observations pour les composantes core (None = égale).
    "half_life_core": 60,
    "half_life_energy": None,
    # Prolongement du prix à la pompe (WOB) au-delà du dernier relevé :
    #   ΔTTC (EUR/1 000 l) = (1 + TVA) × κ × Δ prix de gros (EUR/1 000 l)
    # κ estimé 2010-2026 sur les prix hors taxes zone euro (somme des retards 0-1 mois) :
    # gazole et fioul ≈ 1 pour 1 sur le gasoil, Euro-super 95 ≈ 1,3 × le Brent (marge de raffinage pro-cyclique).
    "wob_passthrough": {"dsl": ("gasoil", 1.08), "heat": ("gasoil", 1.04), "e95": ("brent", 1.31)},
}


ELEC_DRIVER = {"EA": "power_de", "IT": "ttf", "FR": "power_fr", "DE": "power_de", "ES": "power_de"}


# Gaz et électricité : calendrier de révision des contrats des clients finals, par pays.
# (mois de révision, fenêtre de retards du prix de gros moyen [a, z], part indexée mensuellement oui/non)
# Calendriers lus dans les données (|variation mensuelle| moyenne par mois civil, 2015-2026) et
# cohérents avec les règles nationales : DE contrats annuels (janvier) ; IT et ES révisions trimestrielles
# (ARERA, TUR) ; FR électricité TRVE (février, août) ; zone euro = mélange (trimestriel gaz, janvier élec.).
# Calendrier et fenêtre choisis par prévision hors échantillon : origines trimestrielles 2019-01 → 2025-10,
# horizons 1-12 mois, prix de gros réalisés, critère = RMSE du glissement annuel sur les mois cibles ≥ 2023
# (cf. MODELES §4.2-4.3). Le terme de révision n'a pas d'interaction de régime ; la part indexée en a une.
RESET_SPEC = {
    "CP0452": {
        "EA": ((1, 4, 7, 10), 1, 3, True), "IT": ((1, 4, 7, 10), 1, 6, True), "FR": ((1, 4, 7, 10), 1, 6, False),
        "DE": ((1,), 1, 12, False), "ES": ((1, 4, 7, 10), 1, 6, True),
    },
    "CP0451": {
        "EA": ((1, 4, 7, 10), 1, 6, False), "IT": ((1, 4, 7, 10), 1, 3, True), "FR": ((2, 8), 1, 1, False),
        "DE": ((1,), 2, 7, False), "ES": ((1,), 1, 12, True),
    },
}


def reset_buckets(item: str, geo: str, driver: str) -> list:
    months, lo, hi, fast = RESET_SPEC[item][geo]
    b = [Bucket(driver, lo, hi, kind="reset", months=months)]
    if fast:   # part des contrats indexée chaque mois sur le prix de gros (offres de marché)
        b.append(Bucket(driver, 0, 1, True))
    return b


def energy_equations(geo):
    d = ELEC_DRIVER[geo]
    eqs = {
        # Carburants et fioul : prix à la pompe observés (WOB), prolongés par le prix de gros
        "CP0722": Equation(f"{geo} carburants", "CP0722",
                           [Bucket(f"wob_e95_{geo}", 0, 0), Bucket(f"wob_dsl_{geo}", 0, 0)], ar=False),
        "CP0453": Equation(f"{geo} fioul", "CP0453", [Bucket(f"wob_heat_{geo}", 0, 0)], ar=False),
        # Gaz et électricité : révisions à dates fixes (+ part indexée mensuellement), sans inertie AR :
        # un saut de tarif ne se propage pas au mois suivant
        "CP0452": Equation(f"{geo} gaz", "CP0452", reset_buckets("CP0452", geo, "ttf"), ar=False, regime_start=REG),
        "CP0451": Equation(f"{geo} électricité", "CP0451", reset_buckets("CP0451", geo, d), ar=False,
                           regime_start=REG),
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
    extend_wob(X, h.attrs.get("wob"))
    # Séries amont observées (étage 1), complétées plus loin par simulation
    X["ppi_energy"] = db["es_ppi_energy_index"].reindex(idx)
    X["ppi_interm"] = db["es_ppi_intermediate_goods_index"].reindex(idx)
    fm = (db["es_ppi_food_yoy"] / 12).reindex(idx)        # glissement annuel → rythme mensuel
    X["ppi_food"] = np.exp(fm.fillna(0).cumsum() / 100).where(fm.notna())
    return X, last_mkt


def extend_wob(X: pd.DataFrame, anchor: dict | None) -> None:
    """Prolonge les prix à la pompe WOB (colonnes wob_*) après le mois du dernier relevé.
    Mois du dernier relevé : moyenne (partielle) des semaines publiées, inchangée.
    Mois suivants : dernier relevé hebdomadaire + (1 + TVA) × κ × (gros du mois − gros du mois du relevé).
    Avec le scénario central (gasoil tenu 3 mois), le prix à la pompe reste au dernier relevé 3 mois
    (« WOB plat 3 mois »), puis suit la courbe à terme."""
    if not anchor or anchor.get("last_date") is None:
        return
    L = pd.Period(anchor["last_date"], "M")
    kl = {"gasoil": X["gasoil_eur"] * wob.GASOIL_T_PER_KL, "brent": X["brent_eur"] * wob.BRENT_BBL_PER_KL}
    fut = X.index[X.index > L]
    for col, last in anchor["last_week"].items():
        _, prod, geo = col.split("_")
        drv, kappa = CONFIG["wob_passthrough"][prod]
        vat = anchor["vat"].get(geo, 20.0) / 100
        X.loc[fut, col] = last + (1 + vat) * kappa * (kl[drv].loc[fut] - kl[drv].loc[L])


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
