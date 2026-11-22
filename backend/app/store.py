"""Chargement unique (au démarrage) des sorties du moteur et des entrées. Lecture seule."""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from . import config
from .catalog import GEOS


def read_json(path: Path) -> Any:
    """Les JSON du moteur sont en cp1252 sous Windows (write_text sans encodage) : UTF-8 puis repli cp1252."""
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("cp1252")
    return json.loads(text)


def clean(v: Any) -> Any:
    """NaN / numpy → types JSON."""
    if v is None:
        return None
    if isinstance(v, (np.floating, float)):
        f = float(v)
        return None if math.isnan(f) else f
    if isinstance(v, np.integer):
        return int(v)
    return v


def records(df: pd.DataFrame) -> list[dict]:
    return [{k: clean(v) for k, v in r.items()} for r in df.to_dict(orient="records")]


@dataclass
class DataStore:
    headline: pd.DataFrame
    components: pd.DataFrame
    scenarios: pd.DataFrame
    sensitivities: pd.DataFrame
    passthrough: pd.DataFrame
    elasticities: pd.DataFrame
    equations: dict
    dashboard: dict
    backtest_summary: dict
    backtest_errors: pd.DataFrame | None
    market_inputs: dict
    market_fixings: dict
    hicp: dict[str, pd.DataFrame]
    hicp_vintage: str
    weights: dict
    series_catalog: pd.DataFrame
    series_values: pd.DataFrame
    methodology: str
    run_id: str

    @property
    def asof(self) -> str:
        return self.market_inputs["asof"]

    def market(self, geo: str, fixing: str) -> float | None:
        return self.market_fixings.get("fixings", {}).get(geo, {}).get(fixing)


def _hicp_vintage() -> str:
    head = (config.ENGINE_DATA_DIR / "hicp_energy_I25.csv").read_text(encoding="utf-8").splitlines()[0]
    # « # prc_hicp_minr I25 2026-11-18T11:00:00+0100 months 2015-01..2026-10 »
    parts = head.split()
    return parts[3][:10] if len(parts) > 3 else ""


def _run_id(paths: list[Path]) -> str:
    h = hashlib.sha256()
    for p in sorted(paths):
        if p.exists():
            h.update(p.name.encode())
            h.update(p.read_bytes())
    return h.hexdigest()[:12]


def _series(raw_db: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    d = pd.read_csv(raw_db, dtype={"period": str})
    meta_cols = [
        "indicator_label",
        "component",
        "transmission_role",
        "geo",
        "frequency",
        "unit",
        "seasonal_adjustment",
        "source_dataset",
        "source_url",
        "source_update",
        "model_use",
    ]
    g = d.groupby("indicator_code", sort=False)
    cat = g[meta_cols].first()
    cat["start"] = g["period"].min()
    cat["end"] = g["period"].max()
    cat["n"] = g.size()
    cat = cat.reset_index().rename(
        columns={"indicator_code": "code", "indicator_label": "label", "transmission_role": "role"}
    )
    vals = d[["indicator_code", "period", "date", "value", "quality_flag"]].rename(
        columns={"indicator_code": "code"}
    )
    return cat, vals


def load_store() -> DataStore:
    from euroinfl.data import load_hicp, load_weights  # import après catalog (sys.path)

    out = config.OUT_DIR
    be_path = out / "backtest_errors.csv"
    hicp = load_hicp()
    w = load_weights(2026)
    weights = {g: {"top": w[g]["top"], "energy": w[g]["energy"]} for g in GEOS}
    cat, vals = _series(config.RAW_DB)
    files = [*out.glob("*.csv"), *out.glob("*.json"), config.MARKET_INPUTS, config.MARKET_FIXINGS]
    return DataStore(
        headline=pd.read_csv(out / "forecast_headline_models.csv", dtype={"fixing": str}),
        components=pd.read_csv(out / "forecast_components.csv", dtype={"fixing": str}),
        scenarios=pd.read_csv(out / "forecast_scenarios.csv", dtype={"fixing": str}),
        sensitivities=pd.read_csv(out / "sensitivity_fixings_bp.csv", dtype={"fixing": str}),
        passthrough=pd.read_csv(out / "passthrough_profiles.csv", dtype={"fixing": str}),
        elasticities=pd.read_csv(out / "elasticities.csv"),
        equations=read_json(out / "equations.json"),
        dashboard=read_json(out / "dashboard_data.json"),
        backtest_summary=read_json(out / "backtest_summary.json"),
        backtest_errors=pd.read_csv(be_path, dtype={"origin": str}) if be_path.exists() else None,
        market_inputs=read_json(config.MARKET_INPUTS),
        market_fixings=read_json(config.MARKET_FIXINGS),
        hicp=hicp,
        hicp_vintage=_hicp_vintage(),
        weights=weights,
        series_catalog=cat,
        series_values=vals,
        methodology=config.METHODOLOGY_MD.read_text(encoding="utf-8"),
        run_id=_run_id(files),
    )


@lru_cache(maxsize=1)
def get_store() -> DataStore:
    return load_store()
