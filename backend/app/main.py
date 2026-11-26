"""API FastAPI du dashboard HICPxT. Toutes les valeurs viennent de euroinfl/out/* ou des entrées du moteur.

Lancer : cd backend && uvicorn app.main:app --reload --port 8000   (doc : http://localhost:8000/docs)
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import pandas as pd
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware

from . import admin as ADM
from . import catalog as C
from . import config
from . import equations as EQ
from . import schemas as Sch
from .marketdata import quality as Q
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
    CORSMiddleware,
    allow_origins=config.FRONTEND_ORIGINS,
    allow_origin_regex=config.FRONTEND_ORIGIN_REGEX,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
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
        market_geos=[
            g for g in C.GEOS if s.comparable_key(g) and s.market_fixings["fixings"].get(s.comparable_key(g))
        ],
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
    rq = Q.recent_quality(mi)
    recent = [
        {
            "month": m,
            "values": {k: v for k, v in r.items() if not k.startswith("_")},
            "quality": rq[m]["quality"],
            "partial": rq[m]["partial"],
        }
        for m, r in sorted(mi["recent_months"].items())
        if not m.startswith("_")
    ]
    drivers = []
    for k, d in s.dashboard["drivers"].items():
        status = []
        if k in WHOLESALE:
            for m in d["months"]:
                if m in rq:
                    q = Q.driver_quality(rq[m]["quality"], k)
                    if q:
                        status.append({"month": m, "quality": q, "partial": rq[m]["partial"]})
        drivers.append(
            {
                "key": k,
                "label": C.DRIVER_LABELS[k][0],
                "unit": C.DRIVER_LABELS[k][1],
                "months": d["months"],
                "values": d["values"],
                "recent": status,
            }
        )
    data = {
        "asof": mi["asof"],
        "eurusd": mi["eurusd"],
        "curve_method": mi.get("_curve_method"),
        "recent_note": mi["recent_months"].get("_doc"),
        "curves": curves,
        "curve_quality": Q.curve_quality(mi),
        "refreshed": Q.refreshed_on(mi),
        "sources": {k: v for k, v in (mi.get("_sources") or {}).items() if not k.startswith("_")},
        "recent_months": recent,
        "assumptions": mi["assumptions"],
        "drivers": drivers,
    }
    notes = [
        "Courbes par mois de livraison ; niveau du mois M = contrat M+1",
        "recent_months : mois postérieurs à la base (2026-07) ; quality = observe | proxy | estime ; partial = mois en cours",
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


# ------------------------------------------------------------------ écritures : market data et fixings
def reload_all() -> None:
    """Recharge les sorties du moteur et les entrées après une écriture (et le modèle du simulateur)."""
    from . import simulate as SIM

    get_store.cache_clear()
    SIM.model.cache_clear()
    SIM._base.cache_clear()
    get_store()


@app.get("/api/admin/status", tags=["administration"])
def admin_status(request: Request):
    import os

    token = bool(os.environ.get("ADMIN_TOKEN"))
    local = (request.client.host if request.client else "") in ADM.LOCAL_HOSTS
    return {"write_enabled": token or local, "token_required": token}


@app.get("/api/inputs/fixings", response_model=Sch.Envelope[Sch.FixingsData], tags=["inputs"])
def get_fixings():
    s = get_store()
    mf = s.market_fixings
    indices = mf.get("indices", {"EA": {"label": "HICPxT zone euro", "comparable_geo": "EA"}})
    series = [
        {
            "key": k,
            "label": meta["label"],
            "comparable_geo": meta.get("comparable_geo"),
            "asof": mf.get("asof_by_index", {}).get(k, mf.get("asof")),
            "values": [{"fixing": f, "value": mf.get("fixings", {}).get(k, {}).get(f)} for f in C.FIXINGS],
        }
        for k, meta in indices.items()
    ]
    notes = [
        "Fixings de marché : comparaison uniquement, jamais utilisés par le modèle",
        "IPC France hors tabac (Insee) : indice différent de l'IHPC hors tabac prévu, pas d'écart calculé",
    ]
    return {
        "meta": meta(s, ["market"], notes=notes),
        "data": {"source": mf.get("source", ""), "series": series},
    }


@app.put("/api/inputs/fixings", tags=["administration"], dependencies=[Depends(ADM.require_admin)])
def put_fixings(req: Sch.FixingsUpdate):
    ADM.save_fixings(req.key, req.asof, req.values, reload_all)
    return get_fixings()


@app.get("/api/market/paths", response_model=Sch.Envelope[Sch.MarketPaths], tags=["inputs"])
def get_market_paths():
    """Trajectoires des inputs de marché utilisées par le moteur, pour chaque scénario énergie (out/market_paths.json)."""
    s = get_store()
    mp = s.market_paths
    if mp is None:
        raise HTTPException(404, "out/market_paths.json absent : relancer euroinfl/run_all.py")
    rq = Q.recent_quality(s.market_inputs)
    wob_month = mp["wob_last_week"][:7] if mp["wob_last_week"] else None
    drivers = []
    for d in mp["drivers"]:
        origin, partial = [], []
        for m, o in zip(mp["months"], d["origin"], strict=True):
            if o == "recent":  # origine réelle du mois récent : observé / proxy / estimé
                o = Q.driver_quality(rq.get(m, {}).get("quality", {}), d["key"]) or "estime"
                partial.append(bool(rq.get(m, {}).get("partial")))
            else:
                partial.append(o == "observe" and m == wob_month)
            origin.append(o)
        geo = d["key"].rsplit("_", 1)[1] if d["group"] == "pompe" else None
        drivers.append(
            {
                "key": d["key"],
                "label": C.DRIVER_LABELS[d["key"]][0],
                "unit": C.DRIVER_LABELS[d["key"]][1],
                "group": d["group"],
                "geo": geo,
                "scenario_dependent": d["scenario_dependent"],
                "origin": origin,
                "partial": partial,
            }
        )
    data = {
        "asof": s.market_inputs["asof"],
        "months": mp["months"],
        "last_market_month": mp["last_market_month"],
        "wob_last_week": mp["wob_last_week"],
        "scenarios": [{"key": k, "label": v} for k, v in C.P.GASOIL_SCENARIOS.items()],
        "drivers": drivers,
        "paths": mp["paths"],
    }
    notes = [
        "Valeur du mois M = niveau utilisé par le moteur (prix de gros : contrat M+1 coté pendant M ; "
        "prix à la pompe : moyenne des relevés hebdomadaires du mois)",
        "Seul le gasoil (et donc gazole / fioul à la pompe) dépend du scénario énergie",
    ]
    return {"meta": meta(s, notes=notes), "data": data}


@app.post("/api/inputs/market/refresh", tags=["administration"], dependencies=[Depends(ADM.require_admin)])
def post_refresh():
    from .marketdata.sources import SourceError

    try:
        p = ADM.refresh()
    except SourceError as e:
        raise HTTPException(502, f"source de marché indisponible : {e}") from e
    return {"meta": meta(get_store()), "data": p}


@app.get("/api/inputs/market/proposal", tags=["administration"])
def get_proposal():
    return {"meta": meta(get_store()), "data": ADM.proposal()}


@app.post("/api/inputs/market/apply", tags=["administration"], dependencies=[Depends(ADM.require_admin)])
def post_apply():
    res = ADM.apply_proposal(reload_all)
    return {"meta": meta(get_store()), "data": res}
