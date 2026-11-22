/** Backtest : mise en forme de /api/backtest et /api/backtest/errors. Les RMSE et les poids viennent du
 * résumé calculé par summarize_backtest.py ; rien n'est recalculé ici. */
import type { EChartsOption } from 'echarts';
import { GEOS, type BacktestData, type BacktestErrorRow, type Geo, type RmseRow } from '../../api/types';
import { axes } from '../../charts/base';
import { fmtNum } from '../../format';
import { MODEL_LABEL } from '../../labels';
import { INK, MARKS, neutralColor, seriesColor, type Mode } from '../../theme';

export const BT_MODELS = ['BU', 'STAT', 'COMBINE', 'NAIF', 'BU_perfect'] as const;
export type BtModel = (typeof BT_MODELS)[number];
export const KEY_H = [1, 3, 6, 12];
export type Period = 'all' | 'post2023';

export function modelStyle(m: string, mode: Mode): { color: string; type: 'solid' | 'dashed' | 'dotted' } {
  if (m === 'NAIF') return { color: neutralColor('market', mode), type: 'dotted' };
  if (m === 'BU_perfect') return { color: seriesColor('model', 'BU', mode), type: 'dashed' };
  return { color: seriesColor('model', m, mode), type: 'solid' };
}

export function rmse(rows: RmseRow[], geo: string, item: string, model: string, period: Period, h: number) {
  return (
    rows.find(
      (r) => r.geo === geo && r.item === item && r.model === model && r.period === period && r.h === h,
    )?.value ?? null
  );
}

export function modelsAvailable(rows: RmseRow[], item: string, period: Period): BtModel[] {
  const have = new Set(rows.filter((r) => r.item === item && r.period === period).map((r) => r.model));
  return BT_MODELS.filter((m) => have.has(m));
}

export function rmseOption(
  bt: BacktestData,
  geo: Geo,
  item: string,
  period: Period,
  mode: Mode,
): EChartsOption {
  const hs = Array.from({ length: 12 }, (_, i) => i + 1);
  return {
    ...axes(
      mode,
      hs.map((h) => `h${h}`),
      'RMSE (pp)',
    ),
    tooltip: { trigger: 'axis', valueFormatter: (v) => (typeof v === 'number' ? `${fmtNum(v, 2)} pp` : '—') },
    series: modelsAvailable(bt.rmse, item, period).map((m) => {
      const s = modelStyle(m, mode);
      return {
        name: MODEL_LABEL[m] ?? m,
        type: 'line' as const,
        data: hs.map((h) => rmse(bt.rmse, geo, item, m, period, h)),
        symbolSize: 6,
        lineStyle: {
          width: m === 'BU' || m === 'COMBINE' ? 3 : MARKS.lineWidth,
          color: s.color,
          type: s.type,
        },
        itemStyle: { color: s.color },
      };
    }),
  };
}

export function errorsOption(rows: BacktestErrorRow[], mode: Mode): EChartsOption {
  const origins = [...new Set(rows.map((r) => r.origin))].sort();
  const models = ['BU', 'STAT', 'NAIF'];
  const ink = INK[mode];
  return {
    ...axes(mode, origins, 'erreur (pp)'),
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v) => (typeof v === 'number' ? `${fmtNum(v, 2, true)} pp` : '—'),
    },
    dataZoom: [{ type: 'inside' }],
    series: models.map((m, i) => {
      const s = modelStyle(m, mode);
      return {
        name: MODEL_LABEL[m] ?? m,
        type: 'line' as const,
        data: origins.map((o) => rows.find((r) => r.origin === o && r.model === m)?.err ?? null),
        showSymbol: false,
        lineStyle: { width: MARKS.lineWidth, color: s.color, type: s.type },
        itemStyle: { color: s.color },
        markLine:
          i === 0
            ? {
                symbol: 'none',
                silent: true,
                lineStyle: { color: ink.axis, type: 'solid' as const },
                label: { show: false },
                data: [{ yAxis: 0 }],
              }
            : undefined,
      };
    }),
  };
}

export function weightsOption(w: Record<string, number[]>, mode: Mode): EChartsOption {
  const hs = Array.from({ length: 12 }, (_, i) => i + 1);
  return {
    ...axes(
      mode,
      hs.map((h) => `h${h}`),
      'poids du BU',
    ),
    yAxis: {
      type: 'value',
      min: 0,
      max: 1,
      name: 'poids du BU',
      nameTextStyle: { color: INK[mode].muted, align: 'right' },
      splitLine: { lineStyle: { color: INK[mode].grid } },
      axisLabel: { color: INK[mode].muted, formatter: (v: number) => String(v).replace('.', ',') },
    },
    tooltip: { trigger: 'axis', valueFormatter: (v) => (typeof v === 'number' ? fmtNum(v, 2) : '—') },
    series: GEOS.filter((g) => w[g]).map((g) => ({
      name: g,
      type: 'line' as const,
      data: w[g],
      symbolSize: 6,
      lineStyle: { width: MARKS.lineWidth, color: seriesColor('geo', g, mode) },
      itemStyle: { color: seriesColor('geo', g, mode) },
    })),
  };
}
