/**
 * Client de données. Deux modes (plan §3), même interface :
 *  - api    : appels au backend FastAPI (VITE_API_BASE, ou /api relayé par Vite en dev) ;
 *  - static : fichiers JSON de public/data écrits par backend/export_static.py.
 * La table de correspondance route → fichier reprend exactement celle de export_static.py.
 */
import type {
  BacktestData,
  BacktestErrorRow,
  ComponentRow,
  Envelope,
  Equation,
  EquationIndex,
  ElasticityRow,
  Geo,
  HeadlineRow,
  HistoryRow,
  Item,
  MarketInputs,
  MetaData,
  Methodology,
  PassthroughRow,
  ScenarioRow,
  SensitivityRow,
  SeriesData,
  SeriesInfo,
  SimulateData,
  SimulateRequest,
  FixingsData,
  MarketPaths,
} from './types';

export type DataMode = 'api' | 'static';

export const DATA_MODE: DataMode = import.meta.env.VITE_DATA_MODE === 'static' ? 'static' : 'api';
const API_BASE: string = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
const STATIC_BASE = `${import.meta.env.BASE_URL}data`;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string,
  ) {
    super(message);
  }
}

/** Une requête logique : chemin d'API, paramètres, et fichier équivalent en mode statique. */
export interface Request {
  path: string;
  params?: Record<string, string | number | undefined>;
  staticFile: string;
  /** filtre appliqué côté client en mode statique (les fichiers ne sont pas découpés par tous les paramètres) */
  staticFilter?: (data: unknown) => unknown;
}

export function buildUrl(req: Request, mode: DataMode = DATA_MODE): string {
  if (mode === 'static') return `${STATIC_BASE}/${req.staticFile}`;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req.params ?? {}))
    if (v !== undefined && v !== '') qs.set(k, String(v));
  const q = qs.toString();
  return `${API_BASE}${req.path}${q ? `?${q}` : ''}`;
}

export async function fetchEnvelope<T>(req: Request, signal?: AbortSignal, mode: DataMode = DATA_MODE) {
  const url = buildUrl(req, mode);
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = (await res.json()) as { detail?: unknown };
      if (typeof j.detail === 'string') detail = j.detail;
    } catch {
      /* corps non JSON */
    }
    throw new ApiError(`Erreur ${res.status} sur ${req.path} : ${detail}`, res.status, url);
  }
  const env = (await res.json()) as Envelope<T>;
  if (mode === 'static' && req.staticFilter) return { ...env, data: req.staticFilter(env.data) as T };
  return env;
}

// ---------- requêtes nommées (une par route du §4)
export const requests = {
  meta: (): Request => ({ path: '/api/meta', staticFile: 'meta.json' }),
  headline: (geo: Geo): Request => ({
    path: '/api/headline',
    params: { geo },
    staticFile: `headline/${geo}.json`,
  }),
  history: (geo: Geo, item: Item, from = '2015-01'): Request => ({
    path: '/api/history',
    params: { geo, item, from },
    staticFile: `history/${geo}/${item}.json`,
    staticFilter: (d) => (d as HistoryRow[]).filter((r) => r.period >= from),
  }),
  components: (geo: Geo): Request => ({
    path: '/api/components',
    params: { geo },
    staticFile: `components/${geo}.json`,
  }),
  sensitivities: (geo: Geo, shock?: string, item?: Item): Request => ({
    path: '/api/sensitivities',
    params: { geo, shock, item },
    staticFile: `sensitivities/${geo}.json`,
    staticFilter: (d) =>
      (d as SensitivityRow[]).filter((r) => (!shock || r.shock === shock) && (!item || r.item === item)),
  }),
  passthrough: (geo: Geo, item: Item, shock?: string): Request => ({
    path: '/api/passthrough',
    params: { geo, item, shock },
    staticFile: `passthrough/${geo}/${item}.json`,
    staticFilter: (d) => (d as PassthroughRow[]).filter((r) => !shock || r.shock === shock),
  }),
  elasticities: (): Request => ({ path: '/api/elasticities', staticFile: 'elasticities.json' }),
  equationIndex: (): Request => ({ path: '/api/equations', staticFile: 'equations/index.json' }),
  equation: (geo: string, item: string): Request => ({
    path: `/api/equations/${geo}/${item}`,
    staticFile: `equations/${geo}/${item}.json`,
  }),
  scenarios: (geo: Geo): Request => ({
    path: '/api/scenarios',
    params: { geo },
    staticFile: `scenarios/${geo}.json`,
  }),
  backtest: (): Request => ({ path: '/api/backtest', staticFile: 'backtest.json' }),
  backtestErrors: (geo: Geo, h?: number, model?: string): Request => ({
    path: '/api/backtest/errors',
    params: { geo, item: 'TOT_X_TBC', h, model },
    staticFile: `backtest/errors/${geo}.json`,
    staticFilter: (d) =>
      (d as BacktestErrorRow[]).filter((r) => (!h || r.h === h) && (!model || r.model === model)),
  }),
  marketInputs: (): Request => ({ path: '/api/inputs/market', staticFile: 'inputs/market.json' }),
  marketPaths: (): Request => ({ path: '/api/market/paths', staticFile: 'market/paths.json' }),
  seriesCatalog: (): Request => ({ path: '/api/inputs/series', staticFile: 'inputs/series.json' }),
  series: (code: string): Request => ({
    path: `/api/inputs/series/${code}`,
    staticFile: `inputs/series/${code}.json`,
  }),
  methodology: (): Request => ({ path: '/api/methodology', staticFile: 'methodology.json' }),
  fixings: (): Request => ({ path: '/api/inputs/fixings', staticFile: 'inputs/fixings.json' }),
};

/** Type de la donnée renvoyée par chaque requête nommée. */
export interface ResponseTypes {
  meta: MetaData;
  headline: HeadlineRow[];
  history: HistoryRow[];
  components: ComponentRow[];
  sensitivities: SensitivityRow[];
  passthrough: PassthroughRow[];
  elasticities: ElasticityRow[];
  equationIndex: EquationIndex;
  equation: Equation;
  scenarios: ScenarioRow[];
  backtest: BacktestData;
  backtestErrors: BacktestErrorRow[];
  marketInputs: MarketInputs;
  marketPaths: MarketPaths;
  seriesCatalog: SeriesInfo[];
  series: SeriesData;
  methodology: Methodology;
  fixings: FixingsData;
}

/** Recalcul exact par le moteur (mode API uniquement). */
export async function postSimulate(
  body: SimulateRequest,
  signal?: AbortSignal,
): Promise<Envelope<SimulateData>> {
  if (DATA_MODE === 'static')
    throw new ApiError('Recalcul exact indisponible en mode statique', 0, '/api/simulate');
  const url = `${API_BASE}/api/simulate`;
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = (await res.json()) as { detail?: unknown };
      if (typeof j.detail === 'string') detail = j.detail;
    } catch {
      /* corps non JSON */
    }
    throw new ApiError(`Erreur ${res.status} sur /api/simulate : ${detail}`, res.status, url);
  }
  return (await res.json()) as Envelope<SimulateData>;
}

// ------------------------------------------------------------------ écritures (mode API, jeton d'administration)
const TOKEN_KEY = 'inflation-admin-token';

/** Jeton conservé pour la session du navigateur seulement (confort ; jamais dans l'URL). */
export function getAdminToken(): string {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}
export function setAdminToken(t: string) {
  try {
    if (t) window.sessionStorage.setItem(TOKEN_KEY, t);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* stockage indisponible : le jeton reste à ressaisir */
  }
}

export async function adminCall<T>(
  path: string,
  method: 'POST' | 'PUT',
  body?: unknown,
): Promise<Envelope<T>> {
  if (DATA_MODE === 'static') throw new ApiError('Écriture impossible en mode statique', 0, path);
  const url = `${API_BASE}${path}`;
  const token = getAdminToken();
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { 'X-Admin-Token': token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = (await res.json()) as { detail?: unknown };
      if (typeof j.detail === 'string') detail = j.detail;
      else if (j.detail) detail = JSON.stringify(j.detail);
    } catch {
      /* corps non JSON */
    }
    throw new ApiError(`Erreur ${res.status} : ${detail}`, res.status, url);
  }
  return (await res.json()) as Envelope<T>;
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new ApiError(`Erreur ${res.status} sur ${path}`, res.status, path);
  return (await res.json()) as T;
}
