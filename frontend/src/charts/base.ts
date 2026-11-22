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
