"""Chiffres témoins du plan §7 (tests d'acceptation), lus via l'API. Tolérance : ±0,01 pp (±0,05 bp pour les chocs
publiés à 0,1 bp près)."""

import pytest


def _by_fixing(rows, key="fixing"):
    return {r[key]: r for r in rows}


@pytest.mark.parametrize(
    "geo,fixing,expected",
    [
        ("EA", "2026-11", 3.93),
        ("EA", "2027-01", 4.14),
        ("EA", "2027-12", 2.35),
        ("IT", "2026-12", 6.35),
        ("DE", "2027-06", 3.08),
    ],
)
def test_combine(get, geo, fixing, expected):
    rows = _by_fixing(get(f"/api/headline?geo={geo}")["data"])
    assert rows[fixing]["COMBINE"] == pytest.approx(expected, abs=0.01)
    assert round(rows[fixing]["COMBINE"], 2) == expected


def test_market_ea_jan27(get):
    rows = _by_fixing(get("/api/headline?geo=EA")["data"])
    assert rows["2027-01"]["market"] == 4.23
    assert rows["2027-01"]["gap_bp"] == pytest.approx((rows["2027-01"]["COMBINE"] - 4.23) * 100)


@pytest.mark.parametrize(
    "shock,geo,fixing,expected",
    [
        ("ttf_power", "IT", "2027-06", 25.8),
        ("gasoil", "EA", "2027-06", 18.0),
        ("wages", "EA", "2027-12", 16.2),
    ],
)
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
    assert round(sel[1], 2) == 0.36
    assert round(sel[12], 2) == 2.98


def test_energy_weight_ea(get):
    w = get("/api/meta")["data"]["weights"]["EA"]["top"]["NRG"]
    assert round(100 * w, 1) == 9.2
