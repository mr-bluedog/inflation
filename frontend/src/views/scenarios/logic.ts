/** Scénarios de courbe gasoil : mise en forme de /api/scenarios (modèle BU). */
import type { EChartsOption } from 'echarts';
import type { Item, ScenarioInfo, ScenarioRow } from '../../api/types';
import { axes } from '../../charts/base';
import { fmtFixing, fmtPct, fmtPrice } from '../../format';
import { MARKS, seriesColor, type Mode } from '../../theme';

export const SCENARIO_ITEMS: Item[] = ['TOT_X_TBC', 'NRG', 'CP0722'];
export const KEY_FIXINGS = ['2026-12', '2027-06', '2027-12'];

/** Scénarios tracés : ceux qui ne sont pas un doublon déclaré (same_as) d'un autre. */
export function plotted(scenarios: ScenarioInfo[]): ScenarioInfo[] {
  return scenarios.filter((s) => !s.same_as);
}

export function fixingsOf(rows: ScenarioRow[]): string[] {
  return [...new Set(rows.map((r) => r.fixing))].sort();
}

export function value(rows: ScenarioRow[], scenario: string, item: Item, fixing: string): number | null {
  return rows.find((r) => r.scenario === scenario && r.item === item && r.fixing === fixing)?.yoy ?? null;
}

export function gasoil(rows: ScenarioRow[], scenario: string, fixing: string): number | null {
  return rows.find((r) => r.scenario === scenario && r.fixing === fixing)?.gasoil_usd_t ?? null;
}

/** Écart max − min entre scénarios tracés, en bp, pour un fixing. */
export function spreadBp(rows: ScenarioRow[], keys: string[], item: Item, fixing: string): number | null {
  const v = keys.map((k) => value(rows, k, item, fixing)).filter((x): x is number => x !== null);
  return v.length ? (Math.max(...v) - Math.min(...v)) * 100 : null;
}

function lines(
  rows: ScenarioRow[],
  sc: ScenarioInfo[],
  mode: Mode,
  get: (k: string, f: string) => number | null,
  fmt: (v: number | null) => string,
  unit: string,
): EChartsOption {
  const fx = fixingsOf(rows);
  return {
    ...axes(mode, fx.map(fmtFixing), unit),
    tooltip: { trigger: 'axis', valueFormatter: (v) => fmt(typeof v === 'number' ? v : null) },
    series: sc.map((s) => ({
      name: s.key,
      type: 'line' as const,
      data: fx.map((f) => get(s.key, f)),
      symbolSize: 6,
      lineStyle: {
        width: s.key === 'central' ? 3 : MARKS.lineWidth,
        color: seriesColor('scenario', s.key, mode),
      },
      itemStyle: { color: seriesColor('scenario', s.key, mode) },
    })),
  };
}

export function gasoilOption(rows: ScenarioRow[], sc: ScenarioInfo[], mode: Mode): EChartsOption {
  return lines(
    rows,
    sc,
    mode,
    (k, f) => gasoil(rows, k, f),
    (v) => fmtPrice(v, '$/t'),
    '$/t',
  );
}

export function yoyOption(rows: ScenarioRow[], sc: ScenarioInfo[], item: Item, mode: Mode): EChartsOption {
  return lines(
    rows,
    sc,
    mode,
    (k, f) => value(rows, k, item, f),
    (v) => fmtPct(v),
    '%',
  );
}
