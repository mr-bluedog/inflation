"""Schémas pydantic v2 des réponses. Enveloppe commune : {meta, data}."""

from __future__ import annotations

from enum import Enum
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Geo(str, Enum):
    EA = "EA"
    IT = "IT"
    FR = "FR"
    DE = "DE"
    ES = "ES"


class Item(str, Enum):
    TOT_X_TBC = "TOT_X_TBC"
    NRG = "NRG"
    CP0722 = "CP0722"
    CP0453 = "CP0453"
    CP0452 = "CP0452"
    CP0451 = "CP0451"
    FOOD_P_X_TBC = "FOOD_P_X_TBC"
    FOOD_NP = "FOOD_NP"
    IGD_NNRG = "IGD_NNRG"
    SERV = "SERV"


class Meta(BaseModel):
    asof: str = Field(description="Date des courbes de marché (market_inputs.json)")
    last_obs: str = Field(description="Dernier HICP publié (YYYY-MM)")
    run_id: str = Field(description="Empreinte des sorties du moteur et des entrées")
    units: dict[str, str] = {}
    model: str | None = None
    notes: list[str] = []


class Envelope(BaseModel, Generic[T]):
    meta: Meta
    data: T


# ---------- /api/meta ----------
class GeoInfo(BaseModel):
    code: str
    name: str


class FixingInfo(BaseModel):
    period: str
    label: str
    h: int
    indicative: bool


class ItemInfo(BaseModel):
    code: str
    label: str
    level: str


class ShockInfo(BaseModel):
    key: str
    label: str
    size: float
    unit: str


class SimInput(BaseModel):
    key: str
    label: str
    unit: str
    engine_key: str
    kind: str


class ScenarioInfo(BaseModel):
    key: str
    label: str
    same_as: str | None = None


class MetaData(BaseModel):
    geos: list[GeoInfo]
    fixings: list[FixingInfo]
    items: list[ItemInfo]
    top_items: list[str]
    energy_items: list[str]
    shocks: list[ShockInfo]
    sim_inputs: list[SimInput]
    scenarios: list[ScenarioInfo]
    models: list[str]
    weights: dict[str, dict[str, dict[str, float]]]
    power_link: dict[str, float]
    dates: dict[str, str]
    market_note: str
    market_geos: list[str]


# ---------- lignes ----------
class HeadlineRow(BaseModel):
    fixing: str
    h: int
    BU: float
    STAT: float
    w_BU: float
    COMBINE: float
    market: float | None
    gap_bp: float | None


class HistoryRow(BaseModel):
    period: str
    index: float | None
    yoy: float | None


class ComponentRow(BaseModel):
    fixing: str
    item: str
    yoy: float | None
    contrib_pp: float | None


class SensitivityRow(BaseModel):
    shock: str
    item: str
    fixing: str
    bp: float


class PassthroughRow(BaseModel):
    shock: str
    months: int
    fixing: str
    level_pct: float
    elasticity: float | None


class ElasticityRow(BaseModel):
    geo: str
    item: str
    driver: str
    rho: float | None
    sum_current: float | None
    long_run_current: float | None
    sum_old_regime: float | None
    buckets: str
    r2: float | None
    sigma: float | None
    n: int


class EquationTerm(BaseModel):
    term: str
    type: str
    driver: str | None
    driver_label: str | None
    lag_from: int | None
    lag_to: int | None
    transform: str | None
    coef: float
    t: float | None


class Equation(BaseModel):
    key: str
    geo: str
    item: str
    name: str
    item_label: str
    formula: str
    terms: list[EquationTerm]
    seasonal_raw: dict[str, float]
    seasonal_effective: dict[str, float]
    stats: dict[str, Any]
    regime_active: bool
    regime_start: str | None
    drift: float | None
    half_life: float | None
    elasticities: list[ElasticityRow]
    is_energy: bool


class EquationIndexRow(BaseModel):
    key: str
    geo: str
    item: str
    name: str


class EquationIndex(BaseModel):
    equations: list[EquationIndexRow]
    power_link: dict[str, float]


class ScenarioRow(BaseModel):
    scenario: str
    label: str
    item: str
    fixing: str
    yoy: float
    gasoil_usd_t: float


class RmseRow(BaseModel):
    geo: str
    item: str
    model: str
    period: str
    h: int
    value: float


class BacktestData(BaseModel):
    origins: str
    n_origins: int
    rmse: list[RmseRow]
    bias_post2023: list[RmseRow]
    combo_weights: dict[str, list[float]]
    combo_detail: dict[str, list[list[float]]]
    errors_available: bool


class BacktestErrorRow(BaseModel):
    origin: str
    model: str
    h: int
    fc: float | None  # null : BU_perfect sans prix de gros réalisés (origines 2025-08..10, h ≥ 10)
    act: float
    err: float | None


class CurvePoint(BaseModel):
    month: str
    value: float


class Curve(BaseModel):
    key: str
    label: str
    unit: str
    points: list[CurvePoint]


class RecentMonth(BaseModel):
    month: str
    estimated: bool
    values: dict[str, float]


class DriverPath(BaseModel):
    key: str
    label: str
    unit: str
    months: list[str]
    values: list[float | None]
    estimated_months: list[str]


class MarketInputs(BaseModel):
    asof: str
    eurusd: float
    curve_method: str | None
    recent_note: str | None
    curves: list[Curve]
    recent_months: list[RecentMonth]
    assumptions: dict[str, Any]
    drivers: list[DriverPath]


class SeriesInfo(BaseModel):
    code: str
    label: str
    component: str | None
    role: str | None
    geo: str | None
    frequency: str
    unit: str | None
    seasonal_adjustment: str | None
    source_dataset: str | None
    source_url: str | None
    source_update: str | None
    model_use: str | None
    start: str
    end: str
    n: int


class SeriesPoint(BaseModel):
    period: str
    value: float | None
    quality_flag: str | None = None


class SeriesData(BaseModel):
    info: SeriesInfo
    values: list[SeriesPoint]


class Methodology(BaseModel):
    markdown: str
    source: str


# ---------- /api/simulate
class SimulateRequest(BaseModel):
    scenario: str = "central"
    shocks: dict[str, float] = Field(
        default_factory=dict,
        description="Curseurs : % de variation du niveau (ttf, gasoil, brent, eurusd, power_de, power_fr, "
        "food_commo, nonfood_commo) ou pp/an (wages_pp)",
        examples=[{"ttf": 20, "gasoil": -15}],
    )
    link_power: bool = Field(True, description="Électricité de gros entraînée par le gaz")


class SimRow(BaseModel):
    geo: str
    item: str
    fixing: str
    base: float
    shocked: float
    delta_bp: float


class SimulateData(BaseModel):
    scenario: str
    link_power: bool
    shocks: dict[str, float]
    engine_shocks: dict[str, float]
    rows: list[SimRow]


# ---------- fixings de marché (saisie)
class FixingValue(BaseModel):
    fixing: str
    value: float | None


class FixingSeries(BaseModel):
    key: str
    label: str
    comparable_geo: str | None
    asof: str | None
    values: list[FixingValue]


class FixingsData(BaseModel):
    source: str
    series: list[FixingSeries]


class FixingsUpdate(BaseModel):
    key: str = Field(description="EA (HICPxT zone euro) ou FR (IPC France hors tabac)")
    asof: str = Field(description="Date du relevé, AAAA-MM-JJ")
    values: dict[str, float | None] = Field(description="{fixing 'AAAA-MM': glissement annuel en %, ou null}")
