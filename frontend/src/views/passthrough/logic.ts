/** Vue Pass-through : mise en forme de /api/passthrough, /api/elasticities, /api/equations.
 * Aucun recalcul : les niveaux, élasticités et coefficients viennent tels quels du moteur. */
import type { EChartsOption } from 'echarts';
import type { ElasticityRow, Equation, Geo, Item, PassthroughRow } from '../../api/types';
import { axes } from '../../charts/base';
import { fmtNum, fmtPct } from '../../format';
import { DRIVER_SHORT, ITEM_SHORT, MONTHS_SHORT } from '../../labels';
import { INK, MARKS, seriesColor, type Mode } from '../../theme';

// ---------------------------------------------------------------- zoom Italie gaz (MODELES §11)
export const ZOOM_SHOCK = 'ttf_power';
export const ZOOM_MONTHS = [2, 5, 11];
export const ZOOM_IT_ITEMS: Item[] = [
  'CP0452',
  'CP0451',
  'NRG',
  'FOOD_P_X_TBC',
  'FOOD_NP',
  'IGD_NNRG',
  'SERV',
  'TOT_X_TBC',
];
export const ZOOM_COMPARE: Geo[] = ['EA', 'DE', 'FR', 'ES'];
export const ZOOM_PAIRS: (readonly [Geo, Item])[] = [
  ...ZOOM_IT_ITEMS.map((i) => ['IT', i] as const),
  ...ZOOM_COMPARE.map((g) => [g, 'TOT_X_TBC'] as const),
];

export function levelAt(rows: PassthroughRow[] | undefined, months: number): number | null {
  return rows?.find((r) => r.months === months)?.level_pct ?? null;
}

const MONTHS_FR = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

/** '1/4/7/10' → 'janv., avr., juil., oct.' */
export function resetMonthsLabel(months: string): string {
  return months
    .split('/')
    .map((m) => MONTHS_FR[Number(m) - 1] ?? m)
    .join(', ');
}

export interface BucketView {
  driver: string;
  lo: number;
  hi: number;
  value: number;
  /** terme de révision à dates fixes : mois de révision '1/4/7/10' (sinon absent) */
  months?: string;
}

/** Fenêtres d'un champ « buckets » : 'ttf[0-1]=0.252; ttf[révision 1/4/7/10 · moy. 1-6]=0.147'
 * → [{lo:0,hi:1,value:0.252}, {lo:1,hi:6,value:0.147,months:'1/4/7/10'}]. */
export function parseBuckets(s: string): BucketView[] {
  const out: BucketView[] = [];
  for (const x of s.split(';').map((y) => y.trim())) {
    const m = /^(\w+)\[(\d+)-(\d+)\]=(-?[\d.]+)$/.exec(x);
    if (m) {
      out.push({ driver: m[1]!, lo: Number(m[2]), hi: Number(m[3]), value: Number(m[4]) });
      continue;
    }
    const r = /^(\w+)\[révision ([\d/]+) · moy\. (\d+)-(\d+)\]=(-?[\d.]+)$/.exec(x);
    if (r)
      out.push({ driver: r[1]!, months: r[2]!, lo: Number(r[3]), hi: Number(r[4]), value: Number(r[5]) });
  }
  return out;
}

/** Libellé court d'une fenêtre : « 0-1 m » ou « révisions janv., avr., juil., oct. (moy. 1-6 m) ». */
export function bucketWindow(b: BucketView): string {
  const w = b.lo === b.hi ? `${b.lo} m` : `${b.lo}-${b.hi} m`;
  return b.months ? `révisions ${resetMonthsLabel(b.months)} (moy. ${w})` : w;
}

export function elasticity(rows: ElasticityRow[], geo: string, item: string, driver: string) {
  return rows.find((r) => r.geo === geo && r.item === item && r.driver === driver) ?? null;
}

// ---------------------------------------------------------------- profils
export function shocksOf(rows: PassthroughRow[]): string[] {
  return [...new Set(rows.map((r) => r.shock))];
}

export type ProfileUnit = 'level' | 'elasticity';

export function profileOption(
  rows: PassthroughRow[],
  shocks: string[],
  labels: Record<string, string>,
  unit: ProfileUnit,
  mode: Mode,
): EChartsOption {
  const months = [...new Set(rows.map((r) => r.months))].sort((a, b) => a - b);
  const shown = unit === 'elasticity' ? shocks.filter((s) => s !== 'wages') : shocks;
  return {
    ...axes(
      mode,
      months.map((m) => `${m} m`),
      unit === 'level' ? '% de niveau' : 'élasticité',
    ),
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v) =>
        typeof v !== 'number' ? '—' : unit === 'level' ? fmtPct(v, 3, true) : fmtNum(v, 3, true),
    },
    legend: { type: 'scroll', top: 0, left: 0, textStyle: { color: INK[mode].secondary } },
    series: shown.map((s) => ({
      name: labels[s] ?? s,
      type: 'line' as const,
      data: months.map((m) => {
        const r = rows.find((x) => x.shock === s && x.months === m);
        return r ? (unit === 'level' ? r.level_pct : r.elasticity) : null;
      }),
      symbolSize: 6,
      lineStyle: {
        width: MARKS.lineWidth,
        color: seriesColor('shock', s, mode),
        type: s === 'ttf_only' ? ('dashed' as const) : ('solid' as const),
      },
      itemStyle: { color: seriesColor('shock', s, mode) },
    })),
  };
}

// ---------------------------------------------------------------- équations
export interface TermView {
  term: string;
  kind: string;
  driver: string;
  window: string;
  coef: number;
  t: number | null;
  significant: boolean;
}

export function termsView(eq: Equation): TermView[] {
  return eq.terms.map((t) => {
    const reset = t.transform === 'reset';
    const kind =
      t.type === 'driver'
        ? reset
          ? 'β (révision des contrats)'
          : 'β (élasticité)'
        : t.type === 'regime'
          ? `γ (changement depuis ${eq.regime_start ?? '2023-01'})`
          : t.type === 'rho'
            ? 'ρ (inertie)'
            : t.type === 'easter'
              ? 'δ (Pâques)'
              : t.type;
    const lags =
      t.lag_from === null || t.lag_to === null
        ? ''
        : t.lag_from === t.lag_to
          ? `t−${t.lag_from}`
          : `t−${t.lag_from} … t−${t.lag_to}`;
    const months = reset ? /révision ([\d/]+)/.exec(t.term)?.[1] : undefined;
    const window = months ? `révisions ${resetMonthsLabel(months)} · moy. ${lags}` : lags;
    return {
      term: t.term,
      kind,
      driver: t.driver ? (DRIVER_SHORT[t.driver] ?? t.driver_label ?? t.driver) : '',
      window,
      coef: t.coef,
      t: t.t,
      significant: t.t !== null && Math.abs(t.t) >= 2,
    };
  });
}

/** Pass-through du régime actuel par driver = Σ β (+ γ si régime actif), lu dans /api/elasticities. */
export function currentPassthrough(
  eq: Equation,
): { driver: string; sum: number | null; old: number | null }[] {
  return eq.elasticities.map((e) => ({
    driver: DRIVER_SHORT[e.driver] ?? e.driver,
    sum: e.sum_current,
    old: e.sum_old_regime,
  }));
}

export function seasonOption(eq: Equation, mode: Mode): EChartsOption {
  const ink = INK[mode];
  const keys = Array.from({ length: 12 }, (_, i) => `m${String(i + 1).padStart(2, '0')}`);
  return {
    grid: { left: 40, right: 8, top: 24, bottom: 24, containLabel: true },
    legend: { show: false },
    xAxis: {
      type: 'category',
      data: MONTHS_SHORT,
      axisLine: { lineStyle: { color: ink.axis } },
      axisTick: { show: false },
      axisLabel: { color: ink.muted, interval: 0, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      name: '%/mois',
      nameTextStyle: { color: ink.muted },
      splitLine: { lineStyle: { color: ink.grid } },
      axisLabel: { color: ink.muted, formatter: (v: number) => String(v).replace('.', ',') },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v) => (typeof v === 'number' ? `${fmtNum(v, 3, true)} %/mois` : '—'),
    },
    series: [
      {
        name: 'Effet du mois',
        type: 'bar',
        barMaxWidth: 22,
        data: keys.map((k) => eq.seasonal_effective[k] ?? null),
        itemStyle: { color: seriesColor('model', 'COMBINE', mode), borderRadius: 2 },
      },
    ],
  };
}

export function itemLabel(item: string): string {
  return (ITEM_SHORT as Record<string, string>)[item] ?? DRIVER_SHORT[item] ?? item;
}
