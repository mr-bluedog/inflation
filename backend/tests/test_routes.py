"""Forme des réponses et cohérence avec les sorties du moteur (DATA_CONTRACT.md)."""

import json
import math

import pytest

from app import config
from app.store import read_json

GEOS = ["EA", "IT", "FR", "DE", "ES"]
ROUTES = [
    "/api/meta",
    "/api/headline?geo=FR",
    "/api/history?geo=DE&item=SERV",
    "/api/components?geo=ES",
    "/api/sensitivities?geo=EA",
    "/api/passthrough?geo=IT&item=CP0452",
    "/api/elasticities",
    "/api/equations",
    "/api/equations/IT/CP0452",
    "/api/scenarios?geo=EA",
    "/api/backtest",
    "/api/backtest/errors?geo=EA&h=1",
    "/api/inputs/market",
    "/api/inputs/series",
    "/api/inputs/series/legacy_gas_1m",
    "/api/methodology",
]


@pytest.mark.parametrize("url", ROUTES)
def test_envelope(get, url):
    j = get(url)
    assert set(j) == {"meta", "data"}
    m = j["meta"]
    assert m["asof"] == "2026-11-20" and m["last_obs"] == "2026-10" and len(m["run_id"]) == 12


def test_meta(get):
    d = get("/api/meta")["data"]
    assert [g["code"] for g in d["geos"]] == GEOS
    assert len(d["fixings"]) == 14
    assert d["fixings"][0] == {"period": "2026-11", "label": "Nov-26", "h": 1, "indicative": False}
    assert d["fixings"][-1]["label"] == "Dec-27" and d["fixings"][-1]["indicative"] is True
    assert [s["key"] for s in d["shocks"]] == [
        "ttf_power",
        "ttf_only",
        "power_de",
        "power_fr",
        "gasoil",
        "eurusd",
        "food_commo",
        "nonfood_commo",
        "wages",
    ]
    assert d["power_link"]["power_de"] == pytest.approx(0.6821, abs=1e-4)
    assert d["market_geos"] == ["EA"]
    for g in GEOS:
        assert sum(d["weights"][g]["top"].values()) == pytest.approx(1.0)


def test_market_fixings_match_engine(get):
    """Le fichier market_fixings.json reprend exactement les valeurs codées dans run_all.py."""
    dash = read_json(config.OUT_DIR / "dashboard_data.json")
    rows = get("/api/headline?geo=EA")["data"]
    assert [r["market"] for r in rows] == dash["market_ea"]


def test_market_null_outside_ea(get):
    for g in ["IT", "FR", "DE", "ES"]:
        rows = get(f"/api/headline?geo={g}")["data"]
        assert all(r["market"] is None and r["gap_bp"] is None for r in rows)


def test_headline_combine_formula(get):
    for g in GEOS:
        for r in get(f"/api/headline?geo={g}")["data"]:
            assert r["COMBINE"] == pytest.approx(r["w_BU"] * r["BU"] + (1 - r["w_BU"]) * r["STAT"])


def test_history_matches_engine_dashboard(get):
    """yoy recalculé en niveaux (t−12 exact) = historique exporté par le moteur (2023+)."""
    dash = read_json(config.OUT_DIR / "dashboard_data.json")["history"]
    for g in ["EA", "IT"]:
        rows = {r["period"]: r for r in get(f"/api/history?geo={g}&item=TOT_X_TBC&from=2023-01")["data"]}
        for p, v in zip(dash[g]["months"], dash[g]["TOT_X_TBC"], strict=True):
            assert rows[p]["yoy"] == pytest.approx(v, abs=5e-4)
    rows = get("/api/history?geo=EA")["data"]
    assert rows[0]["period"] == "2015-01" and rows[0]["yoy"] is None and rows[12]["yoy"] is not None
    assert rows[-1]["period"] == "2026-10"


def test_components_residual(get):
    for g in GEOS:
        rows = get(f"/api/components?geo={g}")["data"]
        assert len(rows) == 14 * 11
        for f in {r["fixing"] for r in rows}:
            sub = [r for r in rows if r["fixing"] == f]
            tot = next(r["yoy"] for r in sub if r["item"] == "TOT_X_TBC")
            contribs = sum(r["contrib_pp"] for r in sub if r["contrib_pp"] is not None)
            assert contribs == pytest.approx(tot)  # contributions + résidu = total
            assert sum(r["contrib_pp"] is not None for r in sub) == 6


def test_components_bu_matches_headline(get):
    hl = {r["fixing"]: r["BU"] for r in get("/api/headline?geo=EA")["data"]}
    for r in get("/api/components?geo=EA")["data"]:
        if r["item"] == "TOT_X_TBC":
            assert r["yoy"] == pytest.approx(hl[r["fixing"]])


def test_sensitivity_full_matrix(get):
    rows = get("/api/sensitivities?geo=EA")["data"]
    assert len(rows) == 9 * 10 * 14
    nov = [r for r in rows if r["fixing"] == "2026-11" and r["shock"] != "wages"]
    assert all(r["bp"] == 0 for r in nov)  # chocs dès Dec-26


def test_passthrough_it_gas_zoom(get):
    """MODELES §11 : gaz de détail IT +2,4 / +3,5 / +4,4 % à 2 / 5 / 11 mois (TTF +10 %, élec. entraînée)."""
    rows = {r["months"]: r for r in get("/api/passthrough?geo=IT&item=CP0452&shock=ttf_power")["data"]}
    assert [round(rows[m]["level_pct"], 1) for m in (2, 5, 11)] == [2.4, 3.5, 4.4]
    tot = {r["months"]: r for r in get("/api/passthrough?geo=IT&item=TOT_X_TBC&shock=ttf_power")["data"]}
    assert round(tot[11]["level_pct"], 2) == 0.31


def test_equation_it_gas(get):
    d = get("/api/equations/IT/CP0452")["data"]
    assert d["regime_active"] is True and d["regime_start"] == "2023-01" and d["drift"] == 0.15
    reg = sum(t["coef"] for t in d["terms"] if t["type"] in ("driver", "regime"))
    assert reg == pytest.approx(d["elasticities"][0]["sum_current"])  # 0,49 (MODELES §4.2)
    assert round(reg, 2) == 0.49
    assert len(d["seasonal_effective"]) == 12
    assert "γ1·D(2023-01)" in d["formula"]


def test_equation_stage1_and_404(client, get):
    d = get("/api/equations/EA-stage1/ppi_energy")["data"]
    assert d["elasticities"] and all(t["t"] is None for t in d["terms"])
    assert client.get("/api/equations/XX/CP0452").status_code == 404
    assert client.get("/api/headline?geo=XX").status_code == 422


def test_scenarios(get):
    rows = get("/api/scenarios?geo=EA")["data"]
    assert len(rows) == 6 * 3 * 14
    pick = {(r["scenario"], r["fixing"]): r["yoy"] for r in rows if r["item"] == "TOT_X_TBC"}
    # MODELES §12
    assert round(pick[("flat", "2027-06")], 2) == 3.97
    assert round(pick[("full", "2026-12")], 2) == 3.96
    assert pick[("flat3_trend", "2027-12")] == pick[("central", "2027-12")]


def test_backtest_shapes(get):
    d = get("/api/backtest")["data"]
    assert d["n_origins"] == 82 and d["errors_available"] is True
    assert d["combo_weights"]["EA"][0] == 0.764 and len(d["combo_weights"]["EA"]) == 12
    post = [
        r
        for r in d["rmse"]
        if (r["geo"], r["item"], r["model"], r["period"], r["h"]) == ("EA", "TOT_X_TBC", "BU", "post2023", 1)
    ]
    assert round(post[0]["value"], 2) == 0.22
    err = get("/api/backtest/errors?geo=EA&h=1&model=BU")["data"]
    rm = math.sqrt(sum(r["err"] ** 2 for r in err) / len(err))
    assert round(rm, 2) == 0.36


def test_inputs(get):
    d = get("/api/inputs/market")["data"]
    assert [r["month"] for r in d["recent_months"]] == ["2026-08", "2026-09", "2026-10", "2026-11"]
    assert {c["key"] for c in d["curves"]} == {"gasoil_usd_t", "ttf", "brent_usd", "power_fr", "power_de"}
    cat = get("/api/inputs/series")["data"]
    assert len(cat) == 97
    s = get("/api/inputs/series/legacy_gas_1m")["data"]
    assert s["info"]["end"] == "2026-07" and len(s["values"]) == s["info"]["n"]


def test_json_serializable_no_nan(client):
    for url in ROUTES:
        txt = client.get(url).text
        assert "NaN" not in txt, url
        json.loads(txt)
