/** Inputs : courbes de marché, mois estimés, base de séries. Affichage des entrées du moteur, sans transformation. */
import type { EChartsOption } from 'echarts';
import type { Curve, DriverPath, SeriesData, SeriesInfo } from '../../api/types';
import { axes } from '../../charts/base';
import { fmtFixing, fmtNum } from '../../format';
import { INK, MARKS, neutralColor, seriesColor, type Mode } from '../../theme';

/** Fin de l'historique estimé = dernier mois de recent_months ; au-delà, courbes / hypothèses. */
export function lastEstimated(recent: { month: string }[]): string | null {
  return recent.length ? recent[recent.length - 1]!.month : null;
}

export function driverOption(
  d: DriverPath,
  curve: Curve | undefined,
  lastEst: string | null,
  mode: Mode,
): EChartsOption {
  const ink = INK[mode];
  const months = d.months;
  const est = new Set(d.estimated_months);
  const firstEst = d.estimated_months[0];
  const futureFrom = lastEst ? months.find((m) => m > lastEst) : undefined;
  const curvePts = new Map((curve?.points ?? []).map((p) => [p.month, p.value]));
  const color = seriesColor('model', 'COMBINE', mode);
  const fmt = (v: unknown) =>
    typeof v === 'number' ? `${fmtNum(v, d.unit === '$ pour 1 €' ? 3 : 1)} ${d.unit}` : '—';
  const areas: object[] = [];
  if (firstEst && lastEst)
    areas.push([
      { name: 'estimé', xAxis: months.indexOf(firstEst), itemStyle: { color: ink.neutral, opacity: 0.9 } },
      { xAxis: months.indexOf(lastEst) },
    ]);
  if (futureFrom)
    areas.push([
      {
        name: 'courbe / hypothèse',
        xAxis: months.indexOf(futureFrom),
        itemStyle: { color: ink.neutral, opacity: 0.4 },
      },
      { xAxis: months.length - 1 },
    ]);
  return {
    ...axes(mode, months.map(fmtFixing), d.unit),
    tooltip: { trigger: 'axis', valueFormatter: fmt },
    series: [
      {
        name: `${d.label} (niveau du mois utilisé par le moteur)`,
        type: 'line',
        data: d.values,
        symbolSize: (_v: unknown, p: { dataIndex: number }) => (est.has(months[p.dataIndex]!) ? 9 : 5),
        symbol: 'circle',
        lineStyle: { width: MARKS.lineWidth, color },
        itemStyle: {
          color: (p: { dataIndex: number }) => (est.has(months[p.dataIndex]!) ? ink.surface : color),
          borderColor: color,
          borderWidth: 2,
        },
        markArea: {
          silent: true,
          label: { color: ink.muted, fontSize: 11, position: 'insideTop' },
          data: areas as never,
        },
      },
      ...(curve
        ? [
            {
              name: 'Courbe à terme (mois de livraison)',
              type: 'line' as const,
              data: months.map((m) => curvePts.get(m) ?? null),
              symbol: 'diamond',
              symbolSize: 6,
              lineStyle: { width: 1, type: 'dashed' as const, color: neutralColor('market', mode) },
              itemStyle: { color: neutralColor('market', mode) },
            },
          ]
        : []),
    ],
  };
}

export function filterSeries(cat: SeriesInfo[], text: string, component: string): SeriesInfo[] {
  const t = text.trim().toLowerCase();
  return cat.filter(
    (s) =>
      (!component || s.component === component) &&
      (!t || s.code.toLowerCase().includes(t) || s.label.toLowerCase().includes(t)),
  );
}

export function seriesOption(s: SeriesData, mode: Mode): EChartsOption {
  const pts = s.values.filter((v) => v.value !== null);
  return {
    ...axes(
      mode,
      pts.map((p) => p.period),
      s.info.unit ?? '',
    ),
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v) => (typeof v === 'number' ? `${fmtNum(v, 2)} ${s.info.unit ?? ''}` : '—'),
    },
    dataZoom: [{ type: 'inside' }],
    series: [
      {
        name: s.info.label,
        type: 'line',
        data: pts.map((p) => p.value),
        showSymbol: pts.length < 60,
        lineStyle: { width: MARKS.lineWidth, color: seriesColor('model', 'COMBINE', mode) },
        itemStyle: { color: seriesColor('model', 'COMBINE', mode) },
      },
    ],
  };
}
