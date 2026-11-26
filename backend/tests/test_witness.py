"""Chiffres témoins du plan §7 (tests d'acceptation), lus via l'API. Tolérance : ±0,01 pp (±0,05 bp pour les chocs
publiés à 0,1 bp près)."""

import pytest
from conftest import reference_fixings, reference_inputs


def _by_fixing(rows, key="fixing"):
    return {r[key]: r for r in rows}


@pytest.mark.parametrize(
    "geo,fixing,expected",
    [
        ("EA", "2026-11", 3.82),
        ("EA", "2027-01", 3.98),
        ("EA", "2027-12", 2.31),
        ("IT", "2026-12", 5.95),
        ("DE", "2027-06", 2.94),
    ],
)
@reference_inputs
def test_combine(get, geo, fixing, expected):
    rows = _by_fixing(get(f"/api/headline?geo={geo}")["data"])
    assert rows[fixing]["COMBINE"] == pytest.approx(expected, abs=0.01)
    assert round(rows[fixing]["COMBINE"], 2) == expected


@reference_fixings
def test_market_ea_jan27(get):
    rows = _by_fixing(get("/api/headline?geo=EA")["data"])
    assert rows["2027-01"]["market"] == 4.23
    assert rows["2027-01"]["gap_bp"] == pytest.approx((rows["2027-01"]["COMBINE"] - 4.23) * 100)


@pytest.mark.parametrize(
    "shock,geo,fixing,expected",
    [
        ("ttf_power", "IT", "2027-06", 22.0),
        ("gasoil", "EA", "2027-06", 14.5),
        ("wages", "EA", "2027-12", 16.2),
    ],
)
@reference_inputs
def test_sensitivities(get, shock, geo, fixing, expected):
    rows = get(f"/api/sensitivities?geo={geo}&shock={shock}&item=TOT_X_TBC")["data"]
    assert len(rows) == 14
    assert _by_fixing(rows)[fixing]["bp"] == pytest.approx(expected, abs=0.05)


def test_backtest_rmse_ea_bu(get):
    rows = get("/api/backtest")["data"]["rmse"]
    sel = {
        r["h"]: r["value"]
        for r in rows
        if (r["geo"], r["item"], r["model"], r["period"]) == ("EA", "TOT_X_TBC", "BU", "all")
    }
    assert round(sel[1], 2) == 0.31
    assert round(sel[12], 2) == 3.06


def test_energy_weight_ea(get):
    w = get("/api/meta")["data"]["weights"]["EA"]["top"]["NRG"]
    assert round(100 * w, 1) == 9.2
