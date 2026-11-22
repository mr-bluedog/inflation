/**
 * Simulateur de chocs : deux vitesses (plan §4.3).
 *  - Instantané (front) : impact ≈ Σ facteur(choc) × sensibilité_bp(+10 %), sensibilités pré-calculées par le
 *    moteur (scénario central). Le modèle étant linéaire en log des prix, facteur = ln(1+x)/ln(1,1) pour les chocs
 *    multiplicatifs (validé en phase 0, DATA_CONTRACT §12.3), facteur = x pour les salaires (pp/an).
 *    Étiqueté « approximation » partout où il s'affiche.
 *  - Exact (back) : POST /api/simulate → Model.forecast(scenario, shocks).
 */
import type { Geo, SensitivityRow, SimRow } from '../../api/types';

export type Shocks = Record<string, number>;

export interface SliderDef {
  key: string;
  label: string;
  unit: '%' | 'pp/an';
  min: number;
  max: number;
  step: number;
  /** clé de sensibilité pré-calculée (sensitivity_fixings_bp.csv) ; null = pas d'approximation possible */
  sens: (linkPower: boolean) => string | null;
}

export const SLIDERS: SliderDef[] = [
  {
    key: 'ttf',
    label: 'Gaz TTF',
    unit: '%',
    min: -50,
    max: 100,
    step: 5,
    sens: (l) => (l ? 'ttf_power' : 'ttf_only'),
  },
  { key: 'gasoil', label: 'Gasoil ICE (en $)', unit: '%', min: -50, max: 100, step: 5, sens: () => 'gasoil' },
  { key: 'eurusd', label: 'Euro contre dollar', unit: '%', min: -20, max: 20, step: 1, sens: () => 'eurusd' },
  {
    key: 'power_de',
    label: 'Électricité de gros DE',
    unit: '%',
    min: -50,
    max: 100,
    step: 5,
    sens: () => 'power_de',
  },
  {
    key: 'power_fr',
    label: 'Électricité de gros FR',
    unit: '%',
    min: -50,
    max: 100,
    step: 5,
    sens: () => 'power_fr',
  },
  {
    key: 'food_commo',
    label: 'Mat. premières alimentaires',
    unit: '%',
    min: -50,
    max: 100,
    step: 5,
    sens: () => 'food_commo',
  },
  {
    key: 'nonfood_commo',
    label: 'Mat. premières industrielles',
    unit: '%',
    min: -50,
    max: 100,
    step: 5,
    sens: () => 'nonfood_commo',
  },
  {
    key: 'wages_pp',
    label: 'Salaires négociés',
    unit: 'pp/an',
    min: -2,
    max: 2,
    step: 0.25,
    sens: () => 'wages',
  },
  {
    key: 'brent',
    label: 'Brent (scénarios Brent + crack)',
    unit: '%',
    min: -50,
    max: 100,
    step: 5,
    sens: () => null,
  },
];

/** Bornes acceptées par le backend (app/simulate.py BOUNDS). */
export const BOUNDS = { '%': [-90, 300], 'pp/an': [-5, 5] } as const;

export const LN_10PCT = Math.log(1.1);

/** Facteur d'échelle d'un choc par rapport au choc pré-calculé (+10 % ou +1 pp/an). */
export function scaleFactor(def: SliderDef, v: number): number {
  return def.unit === 'pp/an' ? v : Math.log(1 + v / 100) / LN_10PCT;
}

export const key3 = (geo: string, item: string, fixing: string) => `${geo}/${item}/${fixing}`;

export interface Linear {
  bp: Map<string, number>;
  /** curseurs actifs sans sensibilité pré-calculée (non inclus dans l'approximation) */
  unsupported: string[];
}

export function linearImpact(
  sens: Record<Geo, SensitivityRow[]>,
  shocks: Shocks,
  linkPower: boolean,
): Linear {
  const bp = new Map<string, number>();
  const unsupported: string[] = [];
  for (const def of SLIDERS) {
    const v = shocks[def.key] ?? 0;
    if (!v) continue;
    const sk = def.sens(linkPower);
    if (!sk) {
      unsupported.push(def.key);
      continue;
    }
    const f = scaleFactor(def, v);
    for (const [geo, rows] of Object.entries(sens)) {
      for (const r of rows) {
        if (r.shock !== sk) continue;
        const k = key3(geo, r.item, r.fixing);
        bp.set(k, (bp.get(k) ?? 0) + f * r.bp);
      }
    }
  }
  return { bp, unsupported };
}

export function exactMap(rows: SimRow[]): Map<string, SimRow> {
  return new Map(rows.map((r) => [key3(r.geo, r.item, r.fixing), r]));
}

export function activeShocks(shocks: Shocks): Shocks {
  return Object.fromEntries(Object.entries(shocks).filter(([, v]) => v !== 0));
}

// ------------------------------------------------------------------ URL partageable
export function clamp(def: SliderDef, v: number): number {
  const [lo, hi] = BOUNDS[def.unit];
  return Math.min(hi, Math.max(lo, v));
}

export interface SimState {
  shocks: Shocks;
  linkPower: boolean;
  scenario: string;
}

export function parseSearch(sp: URLSearchParams): SimState {
  const shocks: Shocks = {};
  for (const def of SLIDERS) {
    const raw = sp.get(def.key);
    const v = raw === null ? NaN : Number(raw.replace(',', '.'));
    if (Number.isFinite(v) && v !== 0) shocks[def.key] = clamp(def, v);
  }
  return { shocks, linkPower: sp.get('link') !== '0', scenario: sp.get('sc') || 'central' };
}

export function toSearch(st: SimState): URLSearchParams {
  const sp = new URLSearchParams();
  for (const def of SLIDERS) {
    const v = st.shocks[def.key];
    if (v) sp.set(def.key, String(v));
  }
  if (!st.linkPower) sp.set('link', '0');
  if (st.scenario !== 'central') sp.set('sc', st.scenario);
  return sp;
}

// ------------------------------------------------------------------ préréglages
export const PRESETS: { label: string; state: Omit<SimState, 'scenario'> }[] = [
  { label: 'Gaz +20 %', state: { shocks: { ttf: 20 }, linkPower: true } },
  { label: 'Gaz +30 %', state: { shocks: { ttf: 30 }, linkPower: true } },
  { label: 'Pétrole −15 %', state: { shocks: { gasoil: -15, brent: -15 }, linkPower: true } },
  { label: 'Euro fort (+10 %)', state: { shocks: { eurusd: 10 }, linkPower: true } },
  { label: 'Salaires +1 pp', state: { shocks: { wages_pp: 1 }, linkPower: true } },
  {
    label: 'Choc énergie (gaz +50 %, gasoil +30 %)',
    state: { shocks: { ttf: 50, gasoil: 30 }, linkPower: true },
  },
];
