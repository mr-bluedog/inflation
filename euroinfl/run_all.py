"""Produit toutes les sorties : prévisions, scénarios, sensibilités, élasticités, données du dashboard.
Usage : python run_all.py            (≈ 15 s)
Les entrées modifiables sont dans data/market_inputs.json et pipeline.CONFIG.
"""
import sys, json, warnings
from pathlib import Path
warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).parent))
import numpy as np
import pandas as pd
from euroinfl.data import load_user_db, GEOS, ENERGY_ITEMS, CORE, LABELS, COUNTRY_NAMES
from euroinfl import pipeline as P, sensitivity as S
from euroinfl.backtest import StatModel, drivers_at_origin

OUT = Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)
db = load_user_db(Path(__file__).parent / "data" / "euro_inflation_database_long.csv")

# 1. Modèle structurel (BU) et challenger statistique (STAT)
bu = P.Model(db=db).fit()
X, _ = P.build_drivers(db, bu.mkt, "central")
stat = StatModel(db=db).fit(X=X)
f_bu = bu.forecast("central")
f_st = stat.forecast(X=X)

# 2. Combinaison par horizon (poids issus du backtest, cf. out/combo_weights.json)
cw_path = OUT / "combo_weights.json"
cw = json.loads(cw_path.read_text()) if cw_path.exists() else {}
rows = []
for g in GEOS:
    for h, t in enumerate(P.FIXINGS, start=1):
        w = cw.get(g, {}).get(str(min(h, 12)), 1.0)
        b, s = f_bu.yoy(g)[t], f_st.yoy(g)[t]
        rows.append({"geo": g, "fixing": str(t), "h": h, "BU": b, "STAT": s, "w_BU": w, "COMBINE": w * b + (1 - w) * s})
pd.DataFrame(rows).to_csv(OUT / "forecast_headline_models.csv", index=False)

# 3. Détail par composante (BU) + contributions
comp = []
for g in GEOS:
    c = f_bu.components(g)
    ct = f_bu.contributions(g)
    for t in P.FIXINGS:
        for it in c.columns:
            comp.append({"geo": g, "fixing": str(t), "item": it, "yoy": c.at[t, it],
                         "contrib_pp": ct.at[t, it] if it in ct.columns else None})
pd.DataFrame(comp).to_csv(OUT / "forecast_components.csv", index=False)

# 4. Six scénarios gasoil
sc = []
for k in P.GASOIL_SCENARIOS:
    f = bu.forecast(k)
    for g in GEOS:
        for it in ["TOT_X_TBC", "NRG", "CP0722"]:
            for t, v in f.yoy(g, it).items():
                sc.append({"scenario": k, "geo": g, "item": it, "fixing": str(t), "yoy": v,
                           "gasoil_usd_t": f.X.at[t, "gasoil_usd_t"]})
pd.DataFrame(sc).to_csv(OUT / "forecast_scenarios.csv", index=False)

# 5. Sensibilités et pass-through
base, fix, lev = S.run_all(bu)
fix.to_csv(OUT / "sensitivity_fixings_bp.csv", index=False)
lev.to_csv(OUT / "passthrough_profiles.csv", index=False)
el = S.passthrough_tables(bu)
el.to_csv(OUT / "elasticities.csv", index=False)

# 6. Équations (coefficients complets) pour audit
eqs = {}
for g in GEOS:
    for it, e in bu.eq[g].items():
        eqs[f"{g}/{it}"] = {"name": e.name, "coef": e.coef, "t": {k: e.coef[k] / e.se[k] for k in e.coef if e.se[k] > 0},
                            "stats": e.stats, "regime_active": bool(getattr(e, "_regime_on", False)),
                            "drift": e.drift, "half_life": e.half_life}
for k, e in bu.stage1.items():
    eqs[f"EA-stage1/{k}"] = {"name": e.name, "coef": e.coef, "stats": e.stats}
eqs["power_link"] = bu.power_link
(OUT / "equations.json").write_text(json.dumps(eqs, indent=1, ensure_ascii=False, default=float))

# 7. Données pour le dashboard
hist = {}
for g in GEOS:
    H = bu.H[g]
    yy = (100 * (H / H.shift(12) - 1)).loc["2023-01":]
    hist[g] = {"months": [str(p) for p in yy.index], **{c: yy[c].round(3).tolist() for c in ["TOT_X_TBC", "NRG", *ENERGY_ITEMS, *CORE]}}
dash = {
    "asof": bu.mkt["asof"], "last_obs": str(P.LAST_OBS), "fixings": [str(t) for t in P.FIXINGS],
    "geos": GEOS, "geo_names": COUNTRY_NAMES, "labels": LABELS,
    "weights": {g: {"top": bu.W[g]["top"], "energy": bu.W[g]["energy"]} for g in GEOS},
    "forecast": {g: {c: f_bu.yoy(g, c).round(4).tolist() for c in ["TOT_X_TBC", "NRG", *ENERGY_ITEMS, *CORE]} for g in GEOS},
    "stat": {g: f_st.yoy(g).round(4).tolist() for g in GEOS},
    "combined": {g: [r["COMBINE"] for r in rows if r["geo"] == g] for g in GEOS},
    "history": hist,
    "scenarios": {k: {g: bu.forecast(k).yoy(g).round(4).tolist() for g in GEOS} for k in P.GASOIL_SCENARIOS},
    "scenario_labels": P.GASOIL_SCENARIOS,
    "shocks": {k: v[0] for k, v in S.SHOCKS.items()},
    # sensibilités en bp de glissement annuel pour +10 % (ou +1 pp salaires) : [shock][geo][item] = liste par fixing
    "sens": {k: {g: {it: fix[(fix.shock == k) & (fix.geo == g) & (fix.item == it)].sort_values("fixing").bp.round(3).tolist()
                     for it in ["TOT_X_TBC", "NRG", *ENERGY_ITEMS, *CORE]} for g in GEOS} for k in S.SHOCKS},
    "profiles": {k: {g: {it: lev[(lev.shock == k) & (lev.geo == g) & (lev.item == it)].sort_values("months").level_pct.round(4).tolist()
                         for it in ["TOT_X_TBC", "NRG", *ENERGY_ITEMS, *CORE]} for g in GEOS} for k in S.SHOCKS},
    "elasticities": el.replace({np.nan: None}).to_dict(orient="records"),
    "drivers": {c: {"months": [str(p) for p in f_bu.X.loc["2025-01":"2027-12"].index],
                    "values": f_bu.X.loc["2025-01":"2027-12", c].round(3).tolist()}
                for c in ["ttf", "power_fr", "power_de", "gasoil_usd_t", "gasoil_eur", "eurusd", "ppi_energy"]},
}
dash["combo_w"] = {g: [cw.get(g, {}).get(str(min(h, 12)), 1.0) for h in range(1, len(P.FIXINGS) + 1)] for g in GEOS}
dash["market_ea"] = [3.76, 3.88, 4.23, 4.08, 3.64, 3.03, 3.21, 3.56, 3.21, 2.95, 2.36, 2.27, 2.50, 2.48]
dash["market_note"] = "Fixings HICPxT saisis sur euro-inflation.vercel.app le 20/11/2026 (comparaison uniquement)"
bt = OUT / "backtest_summary.json"
if bt.exists():
    dash["backtest"] = json.loads(bt.read_text())
(OUT / "dashboard_data.json").write_text(json.dumps(dash, ensure_ascii=False, default=float))
print(pd.DataFrame({g: [r["COMBINE"] for r in rows if r["geo"] == g] for g in GEOS}, index=[str(t) for t in P.FIXINGS]).round(2))
print("OK →", OUT)
