"""API FastAPI du dashboard HICPxT. Toutes les valeurs viennent de euroinfl/out/* ou des entrées du moteur.

Lancer : cd backend && uvicorn app.main:app --reload --port 8000   (doc : http://localhost:8000/docs)
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import catalog as C
from . import config
from . import equations as EQ
from . import schemas as Sch
from .store import DataStore, clean, get_store, records


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_store()  # chargement unique au démarrage
    yield


app = FastAPI(
    title="API Inflation HICPxT",
    description="Prévisions HICPxT (EA, IT, FR, DE, ES) du moteur euroinfl : lecture des sorties, sans recalcul.",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware, allow_origins=config.FRONTEND_ORIGINS, allow_methods=["*"], allow_headers=["*"]
)


def meta(s: DataStore, keys: list[str] = (), model: str | None = None, notes: list[str] = ()) -> Sch.Meta:
    return Sch.Meta(
        asof=s.asof,
        last_obs=C.LAST_OBS,
        run_id=s.run_id,
        units={k: C.UNITS[k] for k in keys},
        model=model,
        notes=list(notes),
    )


def _geo_df(df: pd.DataFrame, geo: Sch.Geo) -> pd.DataFrame:
    return df[df.geo == geo.value]


# ------------------------------------------------------------------ meta
@app.get("/api/meta", response_model=Sch.Envelope[Sch.MetaData], tags=["référentiel"])
def get_meta():
    s = get_store()
    scen = [
        Sch.ScenarioInfo(key=k, label=v, same_as="central" if k == "flat3_trend" else None)
        for k, v in C.P.GASOIL_SCENARIOS.items()
    ]
    data = Sch.MetaData(
        geos=[Sch.GeoInfo(code=g, name=C.COUNTRY_NAMES[g]) for g in C.GEOS],
        fixings=[
            Sch.FixingInfo(period=f, label=C.fixing_label(f), h=h, indicative=h > C.INDICATIVE_AFTER_H)
            for h, f in enumerate(C.FIXINGS, start=1)
        ],
        items=[Sch.ItemInfo(code=i, label=C.LABELS[i], level=C.item_level(i)) for i in C.ALL_ITEMS],
        top_items=C.TOP_ITEMS,
        energy_items=C.ENERGY_ITEMS,
        shocks=[
            Sch.ShockInfo(key=k, label=v[0], size=C.SHOCK_SIZE[k][0], unit=C.SHOCK_SIZE[k][1])
            for k, v in C.S.SHOCKS.items()
        ],
        sim_inputs=[Sch.SimInput(**x) for x in C.SIM_INPUTS],
        scenarios=scen,
        models=["BU", "STAT", "COMBINE"],
        weights=s.weights,
        power_link=s.equations["power_link"],
        dates={
            "asof": s.asof,
            "last_obs": C.LAST_OBS,
            "hicp_vintage": s.hicp_vintage,
            "market_fixings_asof": s.market_fixings.get("asof", ""),
        },
        market_note=s.market_fixings.get("source", ""),
        market_geos=[g for g, v in s.market_fixings.get("fixings", {}).items() if v],
    )
    return {"meta": meta(s), "data": data}


# ------------------------------------------------------------------ prévisions
@app.get("/api/headline", response_model=Sch.Envelope[list[Sch.HeadlineRow]], tags=["prévisions"])
def get_headline(geo: Sch.Geo = Sch.Geo.EA):
    s = get_store()
    rows = []
    for r in records(_geo_df(s.headline, geo).sort_values("h")):
        mk = s.market(geo.value, r["fixing"])
        rows.append(
            {
                **{k: r[k] for k in ["fixing", "h", "BU", "STAT", "w_BU", "COMBINE"]},
                "market": mk,
                "gap_bp": None if mk is None else (r["COMBINE"] - mk) * 100,
            }
        )
    notes = [
        "gap_bp = (COMBINE − marché) × 100",
        "Marché : comparaison uniquement, jamais utilisé par le modèle",
    ]
    return {"meta": meta(s, ["BU", "STAT", "COMBINE", "market", "gap_bp"], notes=notes), "data": rows}


@app.get("/api/history", response_model=Sch.Envelope[list[Sch.HistoryRow]], tags=["prévisions"])
def get_history(
    geo: Sch.Geo = Sch.Geo.EA,
    item: Sch.Item = Sch.Item.TOT_X_TBC,
    start: str = Query("2015-01", alias="from", pattern=r"^\d{4}-\d{2}$"),
):
    s = get_store()
    lv = s.hicp[geo.value][item.value].dropna()
    rows = []
    for p, v in lv.items():
        if str(p) < start:
            continue
        base = lv.get(p - 12)
        yoy = None if base is None or pd.isna(base) else 100 * (v / base - 1)  # en niveaux, t−12 exact
        rows.append({"period": str(p), "index": clean(v), "yoy": clean(yoy)})
    return {
        "meta": meta(s, ["index", "yoy"], notes=[f"HICP Eurostat, vintage {s.hicp_vintage}"]),
        "data": rows,
    }


@app.get("/api/components", response_model=Sch.Envelope[list[Sch.ComponentRow]], tags=["prévisions"])
def get_components(geo: Sch.Geo = Sch.Geo.EA):
    s = get_store()
    df = _geo_df(s.components, geo)
    rows = records(df[["fixing", "item", "yoy", "contrib_pp"]])
    for f, g in df.groupby("fixing", sort=True):
        tot = g.loc[g.item == "TOT_X_TBC", "yoy"].iloc[0]
        rows.append(
            {
                "fixing": f,
                "item": C.CHAIN_RESIDUAL,
                "yoy": None,
                "contrib_pp": float(tot - g.contrib_pp.sum(skipna=True)),
            }
        )
    notes = [
        "contrib_pp = poids 2026 × glissement annuel (approximation du moteur)",
        f"{C.CHAIN_RESIDUAL} = HICPxT − Σ contributions (résidu de chaînage)",
    ]
    return {"meta": meta(s, ["yoy", "contrib_pp"], model="BU", notes=notes), "data": rows}


@app.get("/api/scenarios", response_model=Sch.Envelope[list[Sch.ScenarioRow]], tags=["prévisions"])
def get_scenarios(geo: Sch.Geo = Sch.Geo.EA):
    s = get_store()
    df = _geo_df(s.scenarios, geo).assign(label=lambda d: d.scenario.map(C.P.GASOIL_SCENARIOS))
    cols = ["scenario", "label", "item", "fixing", "yoy", "gasoil_usd_t"]
    return {
        "meta": meta(
            s, ["yoy", "gasoil_usd_t"], model="BU", notes=["flat3_trend est identique à central (sans WOB)"]
        ),
        "data": records(df[cols]),
    }


# ------------------------------------------------------------------ chocs et transmission
@app.get("/api/sensitivities", response_model=Sch.Envelope[list[Sch.SensitivityRow]], tags=["chocs"])
def get_sensitivities(geo: Sch.Geo = Sch.Geo.EA, shock: str | None = None, item: Sch.Item | None = None):
    s = get_store()
    df = _geo_df(s.sensitivities, geo)
    if shock:
        if shock not in C.S.SHOCKS:
            raise HTTPException(404, f"choc inconnu : {shock}")
        df = df[df.shock == shock]
    if item:
        df = df[df.item == item.value]
    notes = [
        "Choc +10 % du niveau (salaires : +1 pp/an), permanent dès Dec-26 (salaires dès Aug-26)",
        "Modèle BU, scénario central ; pour la COMBINE, multiplier par w_BU",
    ]
    return {
        "meta": meta(s, ["bp"], model="BU", notes=notes),
        "data": records(df[["shock", "item", "fixing", "bp"]]),
    }


@app.get("/api/passthrough", response_model=Sch.Envelope[list[Sch.PassthroughRow]], tags=["chocs"])
def get_passthrough(geo: Sch.Geo = Sch.Geo.IT, item: Sch.Item = Sch.Item.CP0452, shock: str | None = None):
    s = get_store()
    df = s.passthrough[(s.passthrough.geo == geo.value) & (s.passthrough.item == item.value)]
    if shock:
        df = df[df.shock == shock]
    notes = [
        "months = rang du fixing (0 = Nov-26 sans choc, 1 = Dec-26 premier mois choqué), 0-13 mois",
        "elasticity = level_pct / 10 (vide pour les salaires)",
    ]
    return {
        "meta": meta(s, ["level_pct", "elasticity"], model="BU", notes=notes),
        "data": records(
            df[["shock", "months", "fixing", "level_pct", "elasticity"]].sort_values(["shock", "months"])
        ),
    }


@app.get("/api/elasticities", response_model=Sch.Envelope[list[Sch.ElasticityRow]], tags=["chocs"])
def get_elasticities(geo: str | None = None, item: str | None = None):
    s = get_store()
    df = s.elasticities
    if geo:
        df = df[df.geo == geo]
    if item:
        df = df[df.item == item]
    return {
        "meta": meta(s, notes=["sum_* : pass-through cumulé (Σ β, + γ en régime actuel)"]),
        "data": records(df),
    }


@app.get("/api/equations", response_model=Sch.Envelope[Sch.EquationIndex], tags=["chocs"])
def get_equation_index():
    s = get_store()
    rows = []
    for k, v in s.equations.items():
        if k == "power_link":
            continue
        g, it = k.split("/")
        rows.append({"key": k, "geo": g, "item": it, "name": v["name"]})
    return {"meta": meta(s), "data": {"equations": rows, "power_link": s.equations["power_link"]}}


@app.get("/api/equations/{geo}/{item}", response_model=Sch.Envelope[Sch.Equation], tags=["chocs"])
def get_equation(geo: str, item: str):
    s = get_store()
    raw = s.equations.get(f"{geo}/{item}")
    if raw is None:
        raise HTTPException(404, f"équation inconnue : {geo}/{item}")
    el_geo = "EA (étage 1)" if geo == EQ.STAGE1 else geo
    el = records(s.elasticities[(s.elasticities.geo == el_geo) & (s.elasticities.item == item)])
    return {
        "meta": meta(s, notes=["coef en %/mois pour 1 % de variation du driver ; t = coef / écart-type"]),
        "data": EQ.describe(geo, item, raw, el),
    }


# ------------------------------------------------------------------ backtest
@app.get("/api/backtest", response_model=Sch.Envelope[Sch.BacktestData], tags=["backtest"])
def get_backtest():
    s = get_store()
    b = s.backtest_summary

    def flat(block: dict, period: str) -> list[dict]:
        return [
            {"geo": g, "item": it, "model": m, "period": period, "h": h, "value": v}
            for it, by_geo in block.items()
            for g, by_m in by_geo.items()
            for m, vals in by_m.items()
            for h, v in enumerate(vals, start=1)
        ]

    data = {
        "origins": b["origins"],
        "n_origins": b["n_origins"],
        "rmse": flat(b["rmse"], "all") + flat(b["rmse_post2023"], "post2023"),
        "bias_post2023": flat(b["bias_post2023"], "post2023"),
        "combo_weights": {g: [w[str(h)] for h in range(1, 13)] for g, w in b["combo_weights_BU"].items()},
        "combo_detail": b["combo_detail"],
        "errors_available": s.backtest_errors is not None,
    }
    notes = [
        "RMSE du glissement annuel ; h1 = premier mois non publié",
        "COMBINE : toute la période, HICPxT uniquement",
    ]
    return {"meta": meta(s, ["rmse", "bias"], notes=notes), "data": data}


@app.get("/api/backtest/errors", response_model=Sch.Envelope[list[Sch.BacktestErrorRow]], tags=["backtest"])
def get_backtest_errors(
    geo: Sch.Geo = Sch.Geo.EA,
    item: str = "TOT_X_TBC",
    h: int | None = Query(None, ge=1, le=12),
    model: str | None = None,
):
    s = get_store()
    if s.backtest_errors is None:
        raise HTTPException(404, "backtest_errors.csv absent : lancer run_backtest.py")
    df = s.backtest_errors
    df = df[(df.geo == geo.value) & (df.item == item)]
    if h:
        df = df[df.h == h]
    if model:
        df = df[df.model == model]
    return {"meta": meta(s, ["err"]), "data": records(df[["origin", "model", "h", "fc", "act", "err"]])}


# ------------------------------------------------------------------ inputs
# prix de gros : seuls ces drivers ont des mois récents ESTIMÉS (market_inputs.json → recent_months)
WHOLESALE = {"ttf", "power_fr", "power_de", "gasoil_usd_t", "gasoil_eur", "brent_usd", "eurusd"}


@app.get("/api/inputs/market", response_model=Sch.Envelope[Sch.MarketInputs], tags=["inputs"])
def get_market_inputs():
    s = get_store()
    mi = s.market_inputs
    curves = [
        {
            "key": k,
            "label": C.DRIVER_LABELS[k][0],
            "unit": C.DRIVER_LABELS[k][1],
            "points": [{"month": m, "value": v} for m, v in sorted(c.items())],
        }
        for k, c in mi["curves"].items()
    ]
    recent = [
        {"month": m, "estimated": True, "values": {k: v for k, v in r.items() if not k.startswith("_")}}
        for m, r in sorted(mi["recent_months"].items())
        if not m.startswith("_")
    ]
    est = [r["month"] for r in recent]
    drivers = [
        {
            "key": k,
            "label": C.DRIVER_LABELS[k][0],
            "unit": C.DRIVER_LABELS[k][1],
            "months": d["months"],
            "values": d["values"],
            "estimated_months": [m for m in d["months"] if m in est and k in WHOLESALE],
        }
        for k, d in s.dashboard["drivers"].items()
    ]
    data = {
        "asof": mi["asof"],
        "eurusd": mi["eurusd"],
        "curve_method": mi.get("_curve_method"),
        "recent_note": mi["recent_months"].get("_doc"),
        "curves": curves,
        "recent_months": recent,
        "assumptions": mi["assumptions"],
        "drivers": drivers,
    }
    notes = [
        "Courbes par mois de livraison ; niveau du mois M = contrat M+1",
        "recent_months : moyennes ESTIMÉES (base arrêtée en 2026-07)",
        "drivers : trajectoire du scénario central (historique + futur)",
    ]
    return {"meta": meta(s, notes=notes), "data": data}


@app.get("/api/inputs/series", response_model=Sch.Envelope[list[Sch.SeriesInfo]], tags=["inputs"])
def get_series_catalog():
    s = get_store()
    return {
        "meta": meta(s, notes=["Base data/raw/euro_inflation_database_long.csv"]),
        "data": records(s.series_catalog),
    }


@app.get("/api/inputs/series/{code}", response_model=Sch.Envelope[Sch.SeriesData], tags=["inputs"])
def get_series(code: str):
    s = get_store()
    cat = s.series_catalog[s.series_catalog.code == code]
    if cat.empty:
        raise HTTPException(404, f"série inconnue : {code}")
    v = s.series_values[s.series_values.code == code].sort_values("period")
    info = records(cat)[0]
    return {
        "meta": meta(s, notes=[f"unité : {info['unit']}"]),
        "data": {"info": info, "values": records(v[["period", "value", "quality_flag"]])},
    }


@app.get("/api/methodology", response_model=Sch.Envelope[Sch.Methodology], tags=["référentiel"])
def get_methodology():
    s = get_store()
    return {"meta": meta(s), "data": {"markdown": s.methodology, "source": "euroinfl/MODELES.md"}}


@app.get("/api/health", tags=["référentiel"])
def health():
    s = get_store()
    return {"status": "ok", "run_id": s.run_id, "mode": "api"}


# ------------------------------------------------------------------ simulateur (recalcul exact)
@app.post("/api/simulate", response_model=Sch.Envelope[Sch.SimulateData], tags=["chocs"])
def post_simulate(req: Sch.SimulateRequest):
    from . import simulate as SIM

    s = get_store()
    if req.scenario not in C.P.GASOIL_SCENARIOS:
        raise HTTPException(422, f"scénario inconnu : {req.scenario}")
    errs = SIM.validate(req.shocks)
    if errs:
        raise HTTPException(422, " ; ".join(errs))
    eng, rows = SIM.simulate(req.scenario, req.shocks, req.link_power)
    notes = [
        "Recalcul exact : Model.forecast(scenario, shocks) du moteur, modèle BU",
        "Chocs permanents à partir de Dec-26 (salaires : dès Aug-26)",
        "delta_bp = (choqué − base) × 100",
    ]
    data = {
        "scenario": req.scenario,
        "link_power": req.link_power,
        "shocks": req.shocks,
        "engine_shocks": eng,
        "rows": rows,
    }
    return {"meta": meta(s, ["base", "shocked", "delta_bp"], model="BU", notes=notes), "data": data}
