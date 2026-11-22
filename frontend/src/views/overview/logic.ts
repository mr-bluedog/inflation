/** Vue d'ensemble : transformations pures (aucun recalcul de prévision, uniquement des sélections). */
import type { EChartsOption } from 'echarts';
import type { FixingsData, Geo, HeadlineRow, HistoryRow, ModelKey } from '../../api/types';
import { axes } from '../../charts/base';
import { fmtFixing, fmtMonthFr, fmtPct } from '../../format';
import { MODEL_LABEL, monthRange } from '../../labels';
import { INK, MARKS, neutralColor, seriesColor, type Mode } from '../../theme';

/** Fixings de marché d'un AUTRE indice que celui prévu (ex. IPC France hors tabac) : affichés, jamais comparés. */
export interface OtherMarket {
  label: string;
  values: Map<string, number>;
}

export function otherMarketFor(fx: FixingsData | undefined, geo: string): OtherMarket | null {
  const s = fx?.series.find((x) => x.key === geo && x.comparable_geo !== geo);
  if (!s) return null;
  const values = new Map(
    s.values.filter((v) => v.value !== null).map((v) => [v.fixing, v.value as number] as [string, number]),
  );
  return values.size ? { label: s.label, values } : null;
}

export const HISTORY_FROM = '2019-01';
export const ZOOM_FROM = '2024-01'; // zoom initial (l'historique depuis 2019 reste accessible)

export interface Kpis {
  lastObs: HistoryRow | null;
  next: HeadlineRow | null;
  value: number | null;
}

export function kpis(history: HistoryRow[], headline: HeadlineRow[], model: ModelKey): Kpis {
  const lastObs = [...history].reverse().find((r) => r.yoy !== null) ?? null;
  const next = headline.find((r) => r.h === 1) ?? null;
  return { lastObs, next, value: next ? next[model] : null };
}

/** Tableau 14 fixings × 5 pays pour le modèle choisi (+ marché et écart EA). */
export interface TableRow {
  fixing: string;
  h: number;
  values: Record<Geo, number | null>;
  market: number | null;
  gapBp: number | null;
}

export function fixingTable(byGeo: Record<Geo, HeadlineRow[]>, model: ModelKey): TableRow[] {
  const ea = byGeo.EA;
  return ea.map((r) => {
    const values = {} as Record<Geo, number | null>;
    for (const g of Object.keys(byGeo) as Geo[]) {
      values[g] = byGeo[g].find((x) => x.fixing === r.fixing)?.[model] ?? null;
    }
    // écart au marché pour le modèle affiché : (modèle − marché) × 100 ; pour COMBINE = gap_bp de l'API
    const gapBp = r.market === null ? null : model === 'COMBINE' ? r.gap_bp : (r[model] - r.market) * 100;
    return { fixing: r.fixing, h: r.h, values, market: r.market, gapBp };
  });
}

/** Trajectoire : historique publié (gris) puis BU / STAT / COMBINE / marché sur les fixings. */
export function trajectoryOption(
  history: HistoryRow[],
  headline: HeadlineRow[],
  model: ModelKey,
  mode: Mode,
  indicativeFrom: string | null,
  other: OtherMarket | null = null,
): EChartsOption {
  const last = headline[headline.length - 1]?.fixing ?? '2027-12';
  const months = monthRange(HISTORY_FROM, last);
  const hist = new Map(history.map((r) => [r.period, r.yoy]));
  const fc = new Map(headline.map((r) => [r.fixing, r]));
  const lastObs = [...history].reverse().find((r) => r.yoy !== null)?.period ?? null;
  const models: ModelKey[] = ['COMBINE', 'BU', 'STAT'];
  const ink = INK[mode];

  const modelSeries = models.map((m) => ({
    name: m,
    type: 'line' as const,
    data: months.map((p) => fc.get(p)?.[m] ?? null),
    showSymbol: true,
    symbolSize: m === model ? MARKS.symbolSize : 5,
    z: m === model ? 5 : 3,
    lineStyle: { width: m === model ? 3 : MARKS.lineWidth, color: seriesColor('model', m, mode) },
    itemStyle: { color: seriesColor('model', m, mode) },
  }));

  return {
    ...axes(mode, months.map(fmtMonthAxis), '%'),
    legend: { top: 0, left: 0, icon: 'roundRect', textStyle: { color: ink.secondary } },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v) => fmtPct(typeof v === 'number' ? v : null),
    },
    dataZoom: [{ type: 'inside', startValue: Math.max(0, months.indexOf(ZOOM_FROM)) }],
    series: [
      {
        name: 'Publié',
        type: 'line',
        data: months.map((p) => hist.get(p) ?? null),
        showSymbol: false,
        lineStyle: { width: MARKS.lineWidth, color: neutralColor('history', mode) },
        itemStyle: { color: neutralColor('history', mode) },
        markLine: lastObs
          ? {
              symbol: 'none',
              silent: true,
              lineStyle: { color: ink.axis, type: 'solid' },
              label: { formatter: `Dernier publié : ${fmtMonthFr(lastObs)}`, color: ink.muted, fontSize: 11 },
              data: [{ xAxis: months.indexOf(lastObs) }],
            }
          : undefined,
        markArea: indicativeFrom
          ? {
              silent: true,
              itemStyle: { color: ink.neutral, opacity: 0.5 },
              label: { formatter: 'indicatif', color: ink.muted, fontSize: 11, position: 'insideTop' },
              data: [[{ xAxis: months.indexOf(indicativeFrom) }, { xAxis: months.length - 1 }]],
            }
          : undefined,
      },
      ...modelSeries,
      {
        name: 'Marché',
        type: 'line',
        data: months.map((p) => fc.get(p)?.market ?? null),
        showSymbol: false,
        lineStyle: { width: MARKS.lineWidth, type: 'dashed', color: neutralColor('market', mode) },
        itemStyle: { color: neutralColor('market', mode) },
      },
      ...(other
        ? [
            {
              name: `Marché ${other.label} (indice différent)`,
              type: 'line' as const,
              data: months.map((p) => other.values.get(p) ?? null),
              symbol: 'diamond',
              symbolSize: 6,
              lineStyle: { width: 1, type: 'dotted' as const, color: neutralColor('market', mode) },
              itemStyle: { color: neutralColor('market', mode) },
            },
          ]
        : []),
    ],
  };
}

/** Axe : 'Nov-26' sur les fixings, 'Jan-19' ailleurs (même convention). */
function fmtMonthAxis(p: string): string {
  return fmtFixing(p);
}

export function modelTitle(model: ModelKey): string {
  return MODEL_LABEL[model] ?? model;
}
