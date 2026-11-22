/** Vue Pays : sélection et mise en forme de /api/components (modèle BU). Aucun recalcul de prévision :
 * les contributions et le résidu de chaînage viennent tels quels de l'API. */
import type { EChartsOption } from 'echarts';
import type { ComponentRow, Item } from '../../api/types';
import { axes } from '../../charts/base';
import { fmtFixing, fmtPct, fmtPp } from '../../format';
import { ENERGY_ITEMS, ITEM_SHORT, TOP_ITEMS } from '../../labels';
import { INK, MARKS, neutralColor, seriesColor, type Mode } from '../../theme';

export type StackKey = Item | 'CHAIN_RESIDUAL';
export const STACK: StackKey[] = [...TOP_ITEMS, 'CHAIN_RESIDUAL'];

export function fixingsOf(rows: ComponentRow[]): string[] {
  return [...new Set(rows.map((r) => r.fixing))].sort();
}

function pick(rows: ComponentRow[], fixing: string, item: StackKey) {
  return rows.find((r) => r.fixing === fixing && r.item === item);
}

export const yoyOf = (rows: ComponentRow[], f: string, it: StackKey) => pick(rows, f, it)?.yoy ?? null;
export const contribOf = (rows: ComponentRow[], f: string, it: StackKey) =>
  pick(rows, f, it)?.contrib_pp ?? null;

function stackColor(k: StackKey, mode: Mode) {
  return k === 'CHAIN_RESIDUAL' ? neutralColor('residual', mode) : seriesColor('component', k, mode);
}

/** Barres empilées des contributions (pp) + ligne HICPxT (BU). */
export function contributionsOption(rows: ComponentRow[], mode: Mode): EChartsOption {
  const fx = fixingsOf(rows);
  const ink = INK[mode];
  return {
    ...axes(mode, fx.map(fmtFixing), 'pp / %', true),
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const ps = Array.isArray(params) ? params : [params];
        const f = fx[ps[0]?.dataIndex ?? 0]!;
        const lines = STACK.map((k) => `${ITEM_SHORT[k]} : <b>${fmtPp(contribOf(rows, f, k))}</b>`).reverse();
        return `<b>${fmtFixing(f)}</b> · HICPxT BU ${fmtPct(yoyOf(rows, f, 'TOT_X_TBC'))}<br/>${lines.join('<br/>')}`;
      },
    },
    series: [
      ...STACK.map((k) => ({
        name: ITEM_SHORT[k],
        type: 'bar' as const,
        stack: 'contrib',
        barMaxWidth: 28,
        data: fx.map((f) => contribOf(rows, f, k)),
        itemStyle: { color: stackColor(k, mode), borderColor: ink.surface, borderWidth: 1 },
        emphasis: { focus: 'series' as const },
      })),
      {
        name: 'HICPxT (BU)',
        type: 'line' as const,
        data: fx.map((f) => yoyOf(rows, f, 'TOT_X_TBC')),
        symbolSize: MARKS.symbolSize,
        lineStyle: { width: MARKS.lineWidth, color: ink.primary },
        itemStyle: { color: ink.primary },
        z: 10,
      },
    ],
  };
}

/** Sous-postes énergie et agrégat énergie, glissement annuel (%). */
export function energyOption(rows: ComponentRow[], mode: Mode): EChartsOption {
  const fx = fixingsOf(rows);
  const ink = INK[mode];
  return {
    ...axes(mode, fx.map(fmtFixing), '%'),
    tooltip: { trigger: 'axis', valueFormatter: (v) => fmtPct(typeof v === 'number' ? v : null) },
    series: [
      ...ENERGY_ITEMS.map((k) => ({
        name: ITEM_SHORT[k],
        type: 'line' as const,
        data: fx.map((f) => yoyOf(rows, f, k)),
        symbolSize: 6,
        lineStyle: { width: MARKS.lineWidth, color: seriesColor('energy', k, mode) },
        itemStyle: { color: seriesColor('energy', k, mode) },
      })),
      {
        name: 'Énergie (agrégat)',
        type: 'line' as const,
        data: fx.map((f) => yoyOf(rows, f, 'NRG')),
        symbol: 'none',
        lineStyle: { width: 3, color: ink.primary },
        itemStyle: { color: ink.primary },
      },
    ],
  };
}

/** Pont comptable d'un fixing : composantes successives (pp) puis total. Barres flottantes. */
export interface WaterfallStep {
  key: StackKey | 'TOTAL';
  label: string;
  value: number;
  start: number;
  end: number;
}

export function waterfallSteps(rows: ComponentRow[], fixing: string): WaterfallStep[] {
  const steps: WaterfallStep[] = [];
  let acc = 0;
  for (const k of STACK) {
    const v = contribOf(rows, fixing, k) ?? 0;
    steps.push({ key: k, label: ITEM_SHORT[k], value: v, start: acc, end: acc + v });
    acc += v;
  }
  const total = yoyOf(rows, fixing, 'TOT_X_TBC') ?? acc;
  steps.push({ key: 'TOTAL', label: 'HICPxT', value: total, start: 0, end: total });
  return steps;
}

export function waterfallOption(rows: ComponentRow[], fixing: string, mode: Mode): EChartsOption {
  const steps = waterfallSteps(rows, fixing);
  const ink = INK[mode];
  const color = (s: WaterfallStep) => (s.key === 'TOTAL' ? ink.primary : stackColor(s.key, mode));
  return {
    grid: { left: 48, right: 16, top: 24, bottom: 32, containLabel: true },
    legend: { show: false },
    xAxis: {
      type: 'category',
      data: steps.map((s) => s.label),
      axisLine: { lineStyle: { color: ink.axis } },
      axisTick: { show: false },
      axisLabel: { color: ink.muted, interval: 0, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      name: 'pp',
      nameTextStyle: { color: ink.muted },
      splitLine: { lineStyle: { color: ink.grid } },
      axisLabel: { color: ink.muted, formatter: (v: number) => String(v).replace('.', ',') },
    },
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const s = steps[(p as { dataIndex: number }).dataIndex]!;
        return s.key === 'TOTAL'
          ? `<b>HICPxT ${fmtFixing(fixing)}</b> : ${fmtPct(s.value)}`
          : `<b>${s.label}</b> : ${fmtPp(s.value)}<br/>cumul : ${fmtPct(s.end)}`;
      },
    },
    series: [
      {
        type: 'bar',
        stack: 'w',
        stackStrategy: 'all',
        silent: true,
        itemStyle: { color: 'transparent' },
        data: steps.map((s) => Math.min(s.start, s.end)),
      },
      {
        type: 'bar',
        stack: 'w',
        stackStrategy: 'all',
        barMaxWidth: 48,
        label: {
          show: true,
          position: 'top',
          color: ink.secondary,
          fontSize: 11,
          formatter: (p) => {
            const s = steps[p.dataIndex]!;
            return s.key === 'TOTAL' ? fmtPct(s.value) : fmtPp(s.value);
          },
        },
        data: steps.map((s) => ({
          value: Math.abs(s.end - s.start),
          itemStyle: { color: color(s), borderRadius: 2 },
        })),
      },
    ],
  };
}

/** Tableau : lignes = HICPxT, composantes, sous-postes énergie ; colonnes = fixings ; valeurs en %. */
export const TABLE_ROWS: { item: Item; level: 'total' | 'top' | 'sub' }[] = [
  { item: 'TOT_X_TBC', level: 'total' },
  { item: 'NRG', level: 'top' },
  ...ENERGY_ITEMS.map((item) => ({ item, level: 'sub' as const })),
  { item: 'FOOD_P_X_TBC', level: 'top' },
  { item: 'FOOD_NP', level: 'top' },
  { item: 'IGD_NNRG', level: 'top' },
  { item: 'SERV', level: 'top' },
];
