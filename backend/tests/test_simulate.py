"""POST /api/simulate : le recalcul exact retrouve les sensibilités pré-calculées du moteur (choc +10 %)."""

import pytest
from conftest import reference_inputs


def _post(client, body):
    r = client.post("/api/simulate", json=body)
    assert r.status_code == 200, r.text[:300]
    return r.json()


def _pick(rows, geo, fixing, item="TOT_X_TBC"):
    return next(r for r in rows if (r["geo"], r["item"], r["fixing"]) == (geo, item, fixing))


@pytest.mark.parametrize(
    "shocks,link,geo,fixing,expected",
    [
        ({"ttf": 10}, True, "IT", "2027-06", 25.8),
        ({"ttf": 10}, False, "IT", "2027-06", 25.1),
        ({"gasoil": 10}, True, "EA", "2027-06", 18.0),
        ({"wages_pp": 1}, True, "EA", "2027-12", 16.2),
        ({"eurusd": 10}, True, "EA", "2027-06", -17.7),
    ],
)
@reference_inputs
def test_matches_witness(client, shocks, link, geo, fixing, expected):
    d = _post(client, {"scenario": "central", "shocks": shocks, "link_power": link})["data"]
    assert _pick(d["rows"], geo, fixing)["delta_bp"] == pytest.approx(expected, abs=0.05)


def test_matches_precomputed_matrix(client, get):
    """Égalité avec sensitivity_fixings_bp.csv sur toute la grille du choc gasoil."""
    d = _post(client, {"shocks": {"gasoil": 10}})["data"]
    pre = get("/api/sensitivities?geo=FR&shock=gasoil")["data"]
    for p in pre:
        assert _pick(d["rows"], "FR", p["fixing"], p["item"])["delta_bp"] == pytest.approx(p["bp"], abs=1e-6)


def test_engine_shocks_and_base(client, get):
    d = _post(client, {"shocks": {"ttf": 20, "power_de": 5}, "link_power": True})["data"]
    e = d["engine_shocks"]
    assert e["ttf"] == pytest.approx(1.2)
    assert e["power_de"] == pytest.approx(1.05 * 1.2**0.682145, rel=1e-4)  # choc utilisateur × lien gaz
    assert "power_fr" in e
    hl = {r["fixing"]: r["BU"] for r in get("/api/headline?geo=EA")["data"]}
    for r in d["rows"]:
        if r["geo"] == "EA" and r["item"] == "TOT_X_TBC":
            assert r["base"] == pytest.approx(hl[r["fixing"]])
    assert len(d["rows"]) == 5 * 10 * 14


def test_no_shock_zero_delta(client):
    d = _post(client, {"shocks": {}})["data"]
    assert d["engine_shocks"] == {} and all(r["delta_bp"] == 0 for r in d["rows"])


def test_other_scenario(client, get):
    d = _post(client, {"scenario": "flat", "shocks": {}})["data"]
    sc = {
        r["fixing"]: r["yoy"]
        for r in get("/api/scenarios?geo=EA")["data"]
        if r["scenario"] == "flat" and r["item"] == "TOT_X_TBC"
    }
    assert _pick(d["rows"], "EA", "2027-06")["base"] == pytest.approx(sc["2027-06"])


@pytest.mark.parametrize(
    "body",
    [{"shocks": {"oil": 10}}, {"shocks": {"ttf": -95}}, {"shocks": {"wages_pp": 9}}, {"scenario": "x"}],
)
def test_validation(client, body):
    assert client.post("/api/simulate", json=body).status_code == 422


@reference_inputs
def test_ttf_30_exact_vs_log_approx(client, get):
    """Phase 5 : écart linéaire / exact pour TTF +30 % (élec. entraînée). L'approximation log
    ln(1,3)/ln(1,1) × bp(+10 %) reste à ~1,2 bp de l'exact sur IT Jun-27 ; « x/10 » en serait à ~5 bp."""
    import math

    d = _post(client, {"shocks": {"ttf": 30}, "link_power": True})["data"]
    exact = _pick(d["rows"], "IT", "2027-06")["delta_bp"]
    s10 = next(
        r["bp"]
        for r in get("/api/sensitivities?geo=IT&shock=ttf_power&item=TOT_X_TBC")["data"]
        if r["fixing"] == "2027-06"
    )
    log_approx = s10 * math.log(1.3) / math.log(1.1)
    assert round(exact, 1) == 72.1
    assert abs(log_approx - exact) < 1.5
    assert abs(3 * s10 - exact) > 4  # la règle x/10 est nettement moins précise
