/** Options ECharts communes : encres et grille recessives, infobulle avec axe, police système. */
import type { EChartsOption } from 'echarts';
import { INK, MARKS, type Mode } from '../theme';

export function baseOption(mode: Mode): EChartsOption {
  const ink = INK[mode];
  return {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: MARKS.fontFamily, color: ink.secondary },
    grid: { left: 48, right: 16, top: 56, bottom: 32, containLabel: true },
    legend: {
      top: 0,
      left: 0,
      icon: 'roundRect',
      textStyle: { color: ink.secondary },
      itemWidth: 14,
      itemHeight: 8,
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: ink.surface,
      borderColor: ink.border,
      textStyle: { color: ink.primary, fontFamily: MARKS.fontFamily },
      axisPointer: { type: 'line', lineStyle: { color: ink.axis } },
    },
  };
}

/** Axe des catégories (mois) et axe des valeurs avec unité, dans les encres du thème. */
export function axes(
  mode: Mode,
  categories: string[],
  unit: string,
  bars = false,
): Pick<EChartsOption, 'xAxis' | 'yAxis'> {
  const ink = INK[mode];
  return {
    xAxis: {
      type: 'category',
      data: categories,
      boundaryGap: bars,
      axisLine: { lineStyle: { color: ink.axis } },
      axisTick: { show: false },
      axisLabel: { color: ink.muted },
    },
    yAxis: {
      type: 'value',
      name: unit,
      nameTextStyle: { color: ink.muted, align: 'right' },
      scale: true,
      splitLine: { lineStyle: { color: ink.grid } },
      axisLabel: { color: ink.muted, formatter: (v: number) => String(v).replace('.', ',') },
    },
  };
}

const DEEP_KEYS = ['tooltip', 'legend', 'grid', 'textStyle'] as const;

/** Fusionne les options d'une vue sur la base : tooltip, legend, grid et textStyle sont fusionnés un niveau
 * plus profond (la vue précise, la base garde couleurs, police et confinement). */
export function mergeOption(base: EChartsOption, option: EChartsOption): EChartsOption {
  const out: Record<string, unknown> = { ...base, ...option };
  for (const k of DEEP_KEYS) {
    const b = base[k];
    const o = option[k];
    if (b && o && !Array.isArray(b) && !Array.isArray(o) && typeof b === 'object' && typeof o === 'object') {
      out[k] = { ...b, ...o };
    }
  }
  return out as EChartsOption;
}
