/** Backtest : mise en forme de /api/backtest et /api/backtest/errors. Les RMSE et les poids viennent du
 * résumé calculé par summarize_backtest.py ; rien n'est recalculé ici. */
import type { EChartsOption } from 'echarts';
import {
  GEOS,
  type BacktestData,
  type BacktestErrorRow,
  type Geo,
  type RmseRow,
  type ScoreRow,
} from '../../api/types';
import { axes } from '../../charts/base';
import { fmtFixing, fmtNum } from '../../format';
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
      'RMSE (bp)',
    ),
    tooltip: { trigger: 'axis', valueFormatter: (v) => (typeof v === 'number' ? `${fmtNum(v, 0)} bp` : '—') },
    series: modelsAvailable(bt.rmse, item, period).map((m) => {
      const s = modelStyle(m, mode);
      return {
        name: MODEL_LABEL[m] ?? m,
        type: 'line' as const,
        data: hs.map((h) => {
          const v = rmse(bt.rmse, geo, item, m, period, h);
          return v === null ? null : Math.round(v * 1000) / 10; // pp → bp
        }),
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

/** Fixing visé par une prévision : origine (dernier HICP connu) + h mois, au format 'YYYY-MM'. */
export function targetFixing(origin: string, h: number): string {
  const [y, m] = origin.split('-').map(Number) as [number, number];
  const k = y * 12 + (m - 1) + h;
  return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`;
}

export function errorsOption(rows: BacktestErrorRow[], mode: Mode): EChartsOption {
  // axe = fixing visé (origine + h) ; erreur = prévu − fixing réalisé, en bp de glissement annuel
  const origins = [...new Set(rows.map((r) => r.origin))].sort();
  const h = rows[0]?.h ?? 1;
  const models = ['BU', 'STAT', 'NAIF'];
  const ink = INK[mode];
  return {
    ...axes(
      mode,
      origins.map((o) => fmtFixing(targetFixing(o, h))),
      'erreur (bp)',
    ),
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v) => (typeof v === 'number' ? `${fmtNum(v, 0, true)} bp` : '—'),
    },
    dataZoom: [{ type: 'inside' }],
    series: models.map((m, i) => {
      const s = modelStyle(m, mode);
      return {
        name: MODEL_LABEL[m] ?? m,
        type: 'line' as const,
        data: origins.map((o) => {
          const e = rows.find((r) => r.origin === o && r.model === m)?.err;
          return e === undefined || e === null ? null : Math.round(e * 1000) / 10; // pp → bp
        }),
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

// ---------------------------------------------------------------- scores de prédiction par sous-composante
export const SCORE_ITEMS = [
  'TOT_X_TBC',
  'NRG',
  'CP0722',
  'CP0453',
  'CP0452',
  'CP0451',
  'FOOD_P_X_TBC',
  'FOOD_NP',
  'IGD_NNRG',
  'SERV',
] as const;
export type ScoreMetric = 'skill' | 'hit' | 'mae' | 'rmse';

export interface ScoreCell {
  value: number | null;
  skill: number | null;
  hit: number | null;
  rmse: number | null;
  rmseNaif: number | null;
  mae: number | null;
  n: number;
}

/** Une cellule (item, zone, horizon) : score, bon sens, RMSE du modèle et du naïf. */
export function scoreCell(
  scores: ScoreRow[],
  rows: RmseRow[],
  item: string,
  geo: string,
  model: 'BU' | 'STAT',
  period: Period,
  h: number,
  metric: ScoreMetric,
): ScoreCell {
  const s = scores.find(
    (r) => r.item === item && r.geo === geo && r.model === model && r.period === period && r.h === h,
  );
  const r = rmse(rows, geo, item, model, period, h);
  const rn = rmse(rows, geo, item, 'NAIF', period, h);
  const skill = s?.skill ?? null;
  const hit = s?.hit ?? null;
  const mae = s?.mae ?? null;
  return {
    value: metric === 'skill' ? skill : metric === 'hit' ? hit : metric === 'mae' ? mae : r,
    skill,
    hit,
    rmse: r,
    rmseNaif: rn,
    mae,
    n: s?.n ?? 0,
  };
}

/** Teinte « bon ↔ mauvais » centrée sur la référence (score 0, bon sens 50 %) ; null pour le RMSE. */
export function scoreTone(metric: ScoreMetric, v: number | null): number | null {
  if (v === null || metric === 'rmse' || metric === 'mae') return null;
  return metric === 'skill' ? v : (v - 0.5) * 2;
}
