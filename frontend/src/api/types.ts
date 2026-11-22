/**
 * Types des réponses de l'API, écrits à la main d'après backend/app/schemas.py (contrat : PLAN_DASHBOARD §4 et
 * §4.1, DATA_CONTRACT.md). Fixings en ISO 'YYYY-MM' ; affichage via fmtFixing.
 */

export type Geo = 'EA' | 'IT' | 'FR' | 'DE' | 'ES';
export const GEOS: readonly Geo[] = ['EA', 'IT', 'FR', 'DE', 'ES'];

export type Item =
  | 'TOT_X_TBC'
  | 'NRG'
  | 'CP0722'
  | 'CP0453'
  | 'CP0452'
  | 'CP0451'
  | 'FOOD_P_X_TBC'
  | 'FOOD_NP'
  | 'IGD_NNRG'
  | 'SERV';

export type ModelKey = 'BU' | 'STAT' | 'COMBINE';
export const MODELS: readonly ModelKey[] = ['COMBINE', 'BU', 'STAT'];

export interface Meta {
  asof: string;
  last_obs: string;
  run_id: string;
  units: Record<string, string>;
  model: string | null;
  notes: string[];
}

export interface Envelope<T> {
  meta: Meta;
  data: T;
}

// ---------- /api/meta
export interface FixingInfo {
  period: string;
  label: string;
  h: number;
  indicative: boolean;
}
export interface ItemInfo {
  code: Item;
  label: string;
  level: 'total' | 'component' | 'energy_sub';
}
export interface ShockInfo {
  key: string;
  label: string;
  size: number;
  unit: string;
}
export interface SimInput {
  key: string;
  label: string;
  unit: string;
  engine_key: string;
  kind: 'mult' | 'add';
}
export interface ScenarioInfo {
  key: string;
  label: string;
  same_as: string | null;
}
export interface MetaData {
  geos: { code: Geo; name: string }[];
  fixings: FixingInfo[];
  items: ItemInfo[];
  top_items: Item[];
  energy_items: Item[];
  shocks: ShockInfo[];
  sim_inputs: SimInput[];
  scenarios: ScenarioInfo[];
  models: ModelKey[];
  weights: Record<Geo, { top: Record<string, number>; energy: Record<string, number> }>;
  power_link: Record<string, number>;
  dates: { asof: string; last_obs: string; hicp_vintage: string; market_fixings_asof: string };
  market_note: string;
  market_geos: Geo[];
}

// ---------- lignes
export interface HeadlineRow {
  fixing: string;
  h: number;
  BU: number;
  STAT: number;
  w_BU: number;
  COMBINE: number;
  market: number | null;
  gap_bp: number | null;
}
export interface HistoryRow {
  period: string;
  index: number | null;
  yoy: number | null;
}
export interface ComponentRow {
  fixing: string;
  item: Item | 'CHAIN_RESIDUAL';
  yoy: number | null;
  contrib_pp: number | null;
}
export interface SensitivityRow {
  shock: string;
  item: Item;
  fixing: string;
  bp: number;
}
export interface PassthroughRow {
  shock: string;
  months: number;
  fixing: string;
  level_pct: number;
  elasticity: number | null;
}
export interface ElasticityRow {
  geo: string;
  item: string;
  driver: string;
  rho: number | null;
  sum_current: number | null;
  long_run_current: number | null;
  sum_old_regime: number | null;
  buckets: string;
  r2: number | null;
  sigma: number | null;
  n: number;
}
export interface EquationTerm {
  term: string;
  type: string;
  driver: string | null;
  driver_label: string | null;
  lag_from: number | null;
  lag_to: number | null;
  transform: string | null;
  coef: number;
  t: number | null;
}
export interface Equation {
  key: string;
  geo: string;
  item: string;
  name: string;
  item_label: string;
  formula: string;
  terms: EquationTerm[];
  seasonal_raw: Record<string, number>;
  seasonal_effective: Record<string, number>;
  stats: { n?: number; sigma?: number; r2?: number; downweighted?: number; sample?: string };
  regime_active: boolean;
  regime_start: string | null;
  drift: number | null;
  half_life: number | null;
  elasticities: ElasticityRow[];
  is_energy: boolean;
}
export interface EquationIndex {
  equations: { key: string; geo: string; item: string; name: string }[];
  power_link: Record<string, number>;
}
export interface ScenarioRow {
  scenario: string;
  label: string;
  item: Item;
  fixing: string;
  yoy: number;
  gasoil_usd_t: number;
}
export interface RmseRow {
  geo: Geo;
  item: string;
  model: string;
  period: 'all' | 'post2023';
  h: number;
  value: number;
}
export interface BacktestData {
  origins: string;
  n_origins: number;
  rmse: RmseRow[];
  bias_post2023: RmseRow[];
  combo_weights: Record<Geo, number[]>;
  combo_detail: Record<Geo, number[][]>;
  errors_available: boolean;
}
export interface BacktestErrorRow {
  origin: string;
  model: string;
  h: number;
  fc: number | null;
  act: number;
  err: number | null;
}
export interface Curve {
  key: string;
  label: string;
  unit: string;
  points: { month: string; value: number }[];
}
export interface DriverPath {
  key: string;
  label: string;
  unit: string;
  months: string[];
  values: (number | null)[];
  estimated_months: string[];
}
export interface MarketInputs {
  asof: string;
  eurusd: number;
  curve_method: string | null;
  recent_note: string | null;
  curves: Curve[];
  recent_months: { month: string; estimated: boolean; values: Record<string, number> }[];
  assumptions: Record<string, unknown>;
  drivers: DriverPath[];
}
export interface SeriesInfo {
  code: string;
  label: string;
  component: string | null;
  role: string | null;
  geo: string | null;
  frequency: string;
  unit: string | null;
  seasonal_adjustment: string | null;
  source_dataset: string | null;
  source_url: string | null;
  source_update: string | null;
  model_use: string | null;
  start: string;
  end: string;
  n: number;
}
export interface SeriesData {
  info: SeriesInfo;
  values: { period: string; value: number | null; quality_flag: string | null }[];
}
export interface Methodology {
  markdown: string;
  source: string;
}
