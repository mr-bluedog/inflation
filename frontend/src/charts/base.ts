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
      type: 'scroll', // une seule ligne : pas de chevauchement avec l'axe sur petit écran
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

/** Tableau CSV (séparateur « ; », virgule décimale : Excel français) tiré d'une option ECharts à axe de catégories.
 * Exporte exactement les valeurs tracées. null si le graphique n'a pas d'axe de catégories. */
export function csvFromOption(option: EChartsOption): string | null {
  const x = Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis;
  const cats = (x as { data?: unknown[] } | undefined)?.data;
  const series = (Array.isArray(option.series) ? option.series : option.series ? [option.series] : []) as {
    name?: string;
    data?: unknown[];
  }[];
  const named = series.filter((s) => s.name && Array.isArray(s.data));
  if (!Array.isArray(cats) || named.length === 0) return null;
  const cell = (v: unknown) => {
    const n = typeof v === 'object' && v !== null && 'value' in v ? (v as { value: unknown }).value : v;
    return typeof n === 'number' && Number.isFinite(n) ? String(n).replace('.', ',') : '';
  };
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [['', ...named.map((s) => s.name!)].map(esc).join(';')];
  cats.forEach((c, i) => lines.push([esc(String(c)), ...named.map((s) => cell(s.data![i]))].join(';')));
  return lines.join('\r\n');
}

export function fileSlug(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}
