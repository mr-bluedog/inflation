"""Rafraîchissement de la market data (sources simulées, sans réseau), application et saisie des fixings.
Les écritures se font dans des copies temporaires : les fichiers du dépôt ne sont jamais modifiés."""

import json
import shutil
from datetime import date
from pathlib import Path

import pandas as pd
import pytest

from app import admin as ADM
from app import config
from app.marketdata import refresh as R
from app.marketdata import sources as SRC

TODAY = date(2026, 11, 20)
GAL_T = 42 * 7.443
FIX = Path(__file__).parent / "fixtures"  # millésime de référence figé (20/11/2026)


class FakeFetcher:
    """Marché synthétique : TTF 90, Brent 95, ULSD 3,8 $/gal, EUR/USD 1,10, électricité 150 / 160."""

    def _days(self, start, end=TODAY):
        return pd.bdate_range(pd.Timestamp(start), pd.Timestamp(end))

    def eurusd(self, start):
        return pd.Series(1.10, index=self._days(start))

    def daily(self, symbol, start):
        idx = self._days(start)
        if symbol == "TTF=F":
            return pd.Series(90.0, index=idx)
        if symbol == "BZ=F":
            return pd.Series(95.0, index=idx)
        if symbol == "HO=F":
            return pd.Series(3.8, index=idx)
        if symbol.startswith("BZ") and symbol.endswith(".NYM"):
            return pd.Series(90.0, index=idx)
        if symbol.startswith("HO") and symbol.endswith(".NYM"):
            return pd.Series(3.7, index=idx)
        if symbol == "BZZ28.NYM":
            raise SRC.SourceError("inconnu")
        raise SRC.SourceError(f"{symbol} non coté")

    def power(self, bzn, start, end):
        return pd.Series(150.0 if bzn == "DE-LU" else 160.0, index=pd.date_range(start, end))


@pytest.fixture
def current():
    return json.loads((FIX / "market_inputs_20261120.json").read_text(encoding="utf-8"))


@pytest.fixture
def ice():
    # gasoil ICE = 1,05 × ULSD sur les 12 mois connus (2025-08 → 2026-07)
    idx = pd.period_range("2025-08", "2026-07", freq="M")
    return pd.Series(3.8 * GAL_T * 1.05, index=idx)


def test_proposal_follows_engine_conventions(current, ice):
    p = R.build_proposal(current, ice, TODAY, FakeFetcher())
    new = p.inputs
    assert p.gasoil_ratio == pytest.approx(1.05)
    # mois récents : août → mois en cours, moyennes des sources
    months = [k for k in new["recent_months"] if not k.startswith("_")]
    assert months == ["2026-08", "2026-09", "2026-10", "2026-11"]
    nov = {k: v for k, v in new["recent_months"]["2026-11"].items() if not k.startswith("_")}
    # origine enregistrée : observé (BCE, NYMEX), proxy (gasoil, électricité), mois en cours partiel
    assert new["recent_months"]["2026-10"]["_quality"] == R.Q.RECENT_RULES
    # électricité du mois en cours : contrat M+1 de la courbe (le spot partiel créait un pic artificiel)
    assert new["recent_months"]["2026-11"]["_quality"] == {
        **R.Q.RECENT_RULES,
        "power_de": R.Q.ESTIMATED,
        "power_fr": R.Q.ESTIMATED,
    }
    assert new["recent_months"]["2026-11"]["_partial"] is True
    assert new["recent_months"]["2026-10"]["_partial"] is False
    assert new["recent_months"]["2026-10"]["power_de"] == 150.0
    assert new["_curve_quality"] == R.Q.CURVE_RULES
    assert nov == {
        "ttf": 90.0,
        "power_de": current["curves"]["power_de"]["2026-12"],
        "power_fr": current["curves"]["power_fr"]["2026-12"],
        "gasoil_usd_t": round(3.8 * GAL_T * 1.05, 2),
        "brent_usd": 95.0,
        "eurusd": 1.1,
    }
    assert any("spot partiel écarté" in w for w in p.warnings)
    # courbes : livraisons de Dec-26 à Jan-28 ; gasoil = proxy ULSD × ratio
    assert min(new["curves"]["brent_usd"]) == "2026-12" and max(new["curves"]["brent_usd"]) == "2028-01"
    assert new["curves"]["gasoil_usd_t"]["2027-06"] == pytest.approx(round(3.7 * GAL_T * 1.05, 2))
    # TTF : forme précédente recalée sur le front (90 / ancien Dec-26)
    k = 90.0 / current["curves"]["ttf"]["2026-12"]
    assert new["curves"]["ttf"]["2027-06"] == pytest.approx(current["curves"]["ttf"]["2027-06"] * k, abs=1e-3)
    # électricité : courbe à terme précédente conservée (le spot ne sert qu'aux mois réalisés)
    assert new["curves"]["power_de"] == current["curves"]["power_de"]
    assert new["eurusd"] == 1.1 and new["asof"] == "2026-11-20"
    assert new["assumptions"] == current["assumptions"]  # hypothèses hors marché inchangées
    assert any("partielle" in w for w in p.warnings) and any("proxy" in w.lower() for w in p.warnings)


def test_engine_accepts_proposal(current, ice):
    """Le moteur tourne sur la proposition (mêmes clés, mêmes conventions) et la prévision bouge."""
    from euroinfl.data import load_user_db
    from euroinfl.pipeline import Model

    new = R.build_proposal(current, ice, TODAY, FakeFetcher()).inputs
    db = load_user_db(config.ENGINE_DATA_DIR / "euro_inflation_database_long.csv")
    base = Model(db=db).fit().forecast("central").yoy("EA")
    alt = Model(db=db, mkt=new).fit().forecast("central").yoy("EA")
    assert len(alt) == 14 and alt.notna().all()
    assert (alt - base).abs().max() > 0.01


def test_gasoil_ratio_needs_overlap():
    a = pd.Series([1.0], index=pd.period_range("2026-07", periods=1, freq="M"))
    with pytest.raises(SRC.SourceError):
        R.gasoil_ratio(a, a)


def test_diff(current, ice):
    new = R.build_proposal(current, ice, TODAY, FakeFetcher()).inputs
    rows = R.diff(current, new)
    eur = next(r for r in rows if r["key"] == "eurusd" and r["section"] == "scalar")
    assert eur["current"] == current["eurusd"] and eur["proposed"] == 1.1
    assert eur["change_pct"] == pytest.approx((1.1 / current["eurusd"] - 1) * 100)


def test_contract_symbol():
    assert SRC.contract_symbol("BZ", pd.Period("2027-01", "M")) == "BZF27.NYM"
    assert SRC.contract_symbol("HO", pd.Period("2027-12", "M")) == "HOZ27.NYM"


# ------------------------------------------------------------------ application et fixings (fichiers temporaires)
@pytest.fixture
def sandbox(tmp_path, monkeypatch):
    data = tmp_path / "data"
    data.mkdir()
    shutil.copy2(FIX / "market_inputs_20261120.json", data / "market_inputs.json")
    shutil.copy2(FIX / "market_fixings_20261120.json", data / "market_fixings.json")
    monkeypatch.setattr(config, "MARKET_INPUTS", data / "market_inputs.json")
    monkeypatch.setattr(config, "MARKET_FIXINGS", data / "market_fixings.json")
    monkeypatch.setattr(ADM, "PROPOSAL", data / "market_inputs.proposed.json")
    monkeypatch.setattr(ADM, "VINTAGES", data / "vintages")
    shutil.copy2(config.ENGINE_DATA_DIR / "wob_weekly.csv", data / "wob_weekly.csv")
    monkeypatch.setattr(ADM, "WOB_FILE", data / "wob_weekly.csv")
    monkeypatch.setattr(ADM, "WOB_PROPOSAL", data / "wob_weekly.proposed.csv")
    monkeypatch.setattr(
        ADM,
        "ice_gasoil_monthly",
        lambda: pd.Series(3.8 * GAL_T * 1.05, index=pd.period_range("2025-08", "2026-07", freq="M")),
    )
    monkeypatch.setattr(ADM, "export_static_if_present", lambda: False)
    yield data
    # rétablir les vrais fichiers PUIS recharger l'API (sinon le cache garderait les données de test)
    monkeypatch.undo()
    from app.main import reload_all

    reload_all()


def test_refresh_then_apply(sandbox, monkeypatch):
    calls = []
    monkeypatch.setattr(ADM, "run_engine", lambda: calls.append("run") or "OK")
    before = json.loads((sandbox / "market_inputs.json").read_text(encoding="utf-8"))
    p = ADM.refresh(FakeFetcher(), TODAY)
    assert (sandbox / "market_inputs.proposed.json").exists() and p["diff"]
    reloaded = []
    res = ADM.apply_proposal(lambda: reloaded.append(1))
    after = json.loads((sandbox / "market_inputs.json").read_text(encoding="utf-8"))
    assert after["recent_months"]["2026-11"]["ttf"] == 90.0 and calls == ["run"] and reloaded == [1]
    archived = json.loads((sandbox / "vintages" / res["archived"]).read_text(encoding="utf-8"))
    assert archived == before  # l'ancien jeu est archivé tel quel
    assert not (sandbox / "market_inputs.proposed.json").exists()


def test_apply_restores_on_engine_failure(sandbox, monkeypatch):
    ADM.refresh(FakeFetcher(), TODAY)
    before = (sandbox / "market_inputs.json").read_text(encoding="utf-8")
    n = {"calls": 0}

    def engine():
        n["calls"] += 1
        if n["calls"] == 1:
            raise RuntimeError("boom")
        return "OK"

    monkeypatch.setattr(ADM, "run_engine", engine)
    with pytest.raises(Exception, match="inputs précédents restaurés"):
        ADM.apply_proposal(lambda: None)
    assert (sandbox / "market_inputs.json").read_text(encoding="utf-8") == before and n["calls"] == 2


def test_fixings_entry_and_comparability(client, sandbox, monkeypatch):
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    r = client.put(
        "/api/inputs/fixings",
        json={"key": "FR", "asof": "2026-11-21", "values": {"2026-11": 1.9, "2027-01": 2.1}},
    )
    assert r.status_code == 200, r.text
    fr = next(s for s in r.json()["data"]["series"] if s["key"] == "FR")
    assert fr["comparable_geo"] is None and fr["asof"] == "2026-11-21"
    assert {v["fixing"]: v["value"] for v in fr["values"]}["2026-11"] == 1.9
    # l'IPC France n'est pas l'IHPC prévu : aucun écart calculé pour FR, EA inchangé
    hl_fr = client.get("/api/headline?geo=FR").json()["data"]
    assert all(x["market"] is None and x["gap_bp"] is None for x in hl_fr)
    assert client.get("/api/headline?geo=EA").json()["data"][2]["market"] == 4.23
    assert (sandbox / "vintages").exists()
    # validation
    assert (
        client.put("/api/inputs/fixings", json={"key": "IT", "asof": "2026-11-21", "values": {}}).status_code
        == 422
    )
    assert (
        client.put("/api/inputs/fixings", json={"key": "EA", "asof": "21/11", "values": {}}).status_code
        == 422
    )
    assert (
        client.put(
            "/api/inputs/fixings", json={"key": "EA", "asof": "2026-11-21", "values": {"2030-01": 2}}
        ).status_code
        == 422
    )
    assert (
        client.put(
            "/api/inputs/fixings", json={"key": "EA", "asof": "2026-11-21", "values": {"2027-01": 99}}
        ).status_code
        == 422
    )


def test_write_requires_token(client, sandbox, monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "secret-de-test")
    body = {"key": "EA", "asof": "2026-11-21", "values": {"2027-01": 4.2}}
    assert client.put("/api/inputs/fixings", json=body).status_code == 403
    assert client.put("/api/inputs/fixings", json=body, headers={"X-Admin-Token": "faux"}).status_code == 403
    assert client.post("/api/inputs/market/apply").status_code == 403
    ok = client.put("/api/inputs/fixings", json=body, headers={"X-Admin-Token": "secret-de-test"})
    assert ok.status_code == 200
    assert client.get("/api/admin/status").json() == {"write_enabled": True, "token_required": True}


def test_quality_of_vintages(current):
    """Origine des valeurs : jeu d'origine (saisi à la main) → estimé ; jeu rafraîchi → règles ; stockée → lue."""
    from app.marketdata import quality as Q

    q0 = Q.recent_quality(current)
    assert set(q0) == {"2026-08", "2026-09", "2026-10", "2026-11"}
    assert all(set(v["quality"].values()) == {"estime"} and not v["partial"] for v in q0.values())
    assert set(Q.curve_quality(current).values()) == {"archive"}
    refreshed = {**current, "_sources": {"_refreshed": "2026-11-22"}}
    q1 = Q.recent_quality(refreshed)
    assert q1["2026-11"]["partial"] and not q1["2026-10"]["partial"]
    assert q1["2026-09"]["quality"]["ttf"] == "observe" and q1["2026-09"]["quality"]["power_de"] == "proxy"
    assert Q.driver_quality(q1["2026-09"]["quality"], "gasoil_eur") == "proxy"  # dérivé : le moins fiable
    assert Q.driver_quality(q1["2026-09"]["quality"], "ppi_energy") is None


def test_engine_ignores_quality_keys(current, ice):
    """Les clés d'origine (« _quality », « _partial », « _curve_quality ») n'influencent pas le moteur."""
    from euroinfl.data import load_user_db
    from euroinfl.pipeline import Model

    new = R.build_proposal(current, ice, TODAY, FakeFetcher()).inputs
    bare = json.loads(json.dumps(new))
    bare.pop("_curve_quality")
    for m, row in bare["recent_months"].items():
        if not m.startswith("_"):
            row.pop("_quality"), row.pop("_partial")
    db = load_user_db(config.ENGINE_DATA_DIR / "euro_inflation_database_long.csv")
    a = Model(db=db, mkt=new).fit().forecast("central").yoy("EA")
    b = Model(db=db, mkt=bare).fit().forecast("central").yoy("EA")
    assert (a - b).abs().max() == 0


# ------------------------------------------------------------------ Weekly Oil Bulletin
def _wob_xlsx(weeks: dict[str, float]) -> bytes:
    """Classeur au format de l'historique officiel (3 lignes d'en-tête, colonnes « <pays>_price_… »)."""
    import io

    cols = ["Date"]
    for p in ("EUR", "FR", "DE", "IT", "ES"):
        for prod in ("euro95", "diesel", "heating_oil"):
            cols.append(f"{p}_price_with_tax_{prod}")

    def sheet(tag):
        head = [
            [c.replace("with_tax", tag) for c in cols],
            [None] * len(cols),
            ["Date"] + ["1000 l"] * (len(cols) - 1),
        ]
        body = [[pd.Timestamp(d)] + [v] * (len(cols) - 1) for d, v in weeks.items()]
        return pd.DataFrame(head + body)

    vat = pd.DataFrame(
        [["VAT"], ["CTR"], [None, "Since:", "Euro-super 95"], [None, None, "1000 l"]]
        + [[f"{c}_", "2020-01-01", v] for c, v in (("FR", 20), ("DE", 19), ("IT", 22), ("ES", 21))]
    )
    buf = io.BytesIO()
    with pd.ExcelWriter(buf) as w:
        sheet("with_tax").to_excel(w, sheet_name="Prices with taxes", header=False, index=False)
        sheet("wo_tax").to_excel(w, sheet_name="Prices wo taxes", header=False, index=False)
        vat.to_excel(w, sheet_name="VAT", header=False, index=False)
    return buf.getvalue()


class WobFetcher(FakeFetcher):
    def wob_history(self):
        return _wob_xlsx({"2026-11-02": 2000.0, "2026-11-09": 1900.0, "2026-11-16": 1800.0})


def test_wob_parse_and_monthly():
    import io

    from euroinfl import wob

    weekly, vat = wob.parse_history(io.BytesIO(WobFetcher().wob_history()))
    assert vat["DE"] == 19 and vat["EA"] == pytest.approx(20.5)
    m = wob.monthly(weekly)
    assert m.loc[pd.Period("2026-11", "M"), "wob_e95_EA"] == pytest.approx(1900.0)
    # backtest pseudo temps réel : seuls les relevés publiés à la date de coupure comptent
    m2 = wob.monthly(weekly, pd.Timestamp("2026-11-10"))
    assert m2.loc[pd.Period("2026-11", "M"), "wob_dsl_FR"] == pytest.approx(1950.0)
    d, last = wob.last_week(weekly)
    assert d == pd.Timestamp("2026-11-16") and last["wob_heat_IT"] == 1800.0


def test_refresh_with_wob_then_apply(sandbox, monkeypatch):
    monkeypatch.setattr(ADM, "run_engine", lambda: "OK")
    before_wob = (sandbox / "wob_weekly.csv").read_text(encoding="utf-8")
    p = ADM.refresh(WobFetcher(), TODAY)
    assert p["wob"] is True and p["inputs"]["wob_last_week"] == "2026-11-16"
    nov = next(r for r in p["diff"] if r["key"] == "wob_e95_EA" and r["period"] == "2026-11")
    assert nov["proposed"] == pytest.approx(1900.0) and nov["unit"] == "€/1 000 l"
    assert (sandbox / "wob_weekly.proposed.csv").exists()
    ADM.apply_proposal(lambda: None)
    assert (sandbox / "wob_weekly.csv").read_text(encoding="utf-8") != before_wob
    assert not (sandbox / "wob_weekly.proposed.csv").exists()
    assert any(
        f.name.startswith("wob_weekly_") for f in (sandbox / "vintages").iterdir()
    )  # ancien fichier archivé


def test_refresh_without_wob_keeps_file(sandbox, monkeypatch):
    p = ADM.refresh(FakeFetcher(), TODAY)
    assert p["wob"] is False and not (sandbox / "wob_weekly.proposed.csv").exists()
