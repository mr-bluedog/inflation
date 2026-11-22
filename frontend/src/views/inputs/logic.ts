/** Inputs : courbes de marché, mois estimés, base de séries. Affichage des entrées du moteur, sans transformation. */
import type { EChartsOption } from 'echarts';
import type {
  Curve,
  CurveQuality,
  DiffRow,
  DriverPath,
  Quality,
  RecentStatus,
  SeriesData,
  SeriesInfo,
} from '../../api/types';
import { axes } from '../../charts/base';
import { fmtFixing, fmtNum } from '../../format';
import { INK, MARKS, neutralColor, seriesColor, type Mode } from '../../theme';

/** Fin des mois hors base de données = dernier mois de recent_months ; au-delà, courbes / hypothèses. */
export function lastEstimated(recent: { month: string }[]): string | null {
  return recent.length ? recent[recent.length - 1]!.month : null;
}

export const QUALITY_LABEL: Record<Quality, string> = {
  observe: 'observé',
  proxy: 'proxy',
  estime: 'estimé',
};
export const CURVE_QUALITY_LABEL: Record<CurveQuality, string> = {
  observe: 'contrats cotés',
  proxy: 'proxy (contrats d’un autre instrument)',
  recale: 'forme précédente recalée sur le front du jour',
  conserve: 'courbe précédente conservée (pas de contrats publics)',
  archive: 'archive ICE recalée (jeu d’origine)',
};

/** Libellé d'un mois hors base : « observé », « proxy · partiel »… */
export function statusLabel(s: Pick<RecentStatus, 'quality' | 'partial'>): string {
  return QUALITY_LABEL[s.quality] + (s.partial ? ' · partiel' : '');
}

/** Libellé de la zone (court, pour tenir dans la zone grisée) : origines rencontrées sur la période.
 * Le mois partiel est signalé dans l'infobulle, la tuile et le tableau. */
export function areaLabel(recent: RecentStatus[]): string {
  return [...new Set(recent.map((r) => r.quality))].map((q) => QUALITY_LABEL[q]).join(' / ');
}

/** Résumé de l'origine des mois hors base, par catégorie : { observé: [EUR/USD, TTF…], proxy: […] }. */
export function qualitySummary(
  rows: { quality: Record<string, Quality> }[],
  labels: Record<string, string>,
): Partial<Record<Quality, string[]>> {
  const worst: Record<string, Quality> = {};
  const rank: Record<Quality, number> = { observe: 0, proxy: 1, estime: 2 };
  for (const r of rows)
    for (const [k, q] of Object.entries(r.quality)) if (!worst[k] || rank[q] > rank[worst[k]!]) worst[k] = q;
  const out: Partial<Record<Quality, string[]>> = {};
  for (const [k, q] of Object.entries(worst)) (out[q] ??= []).push(labels[k] ?? k);
  return out;
}

export function driverOption(
  d: DriverPath,
  curve: Curve | undefined,
  lastEst: string | null,
  mode: Mode,
): EChartsOption {
  const ink = INK[mode];
  const months = d.months;
  const status = new Map(d.recent.map((r) => [r.month, r]));
  // point creux = valeur qui n'est pas une moyenne complète observée (proxy, estimée ou mois partiel)
  const hollow = (m: string) => {
    const s = status.get(m);
    return !!s && (s.quality !== 'observe' || s.partial);
  };
  const first = d.recent[0]?.month;
  const last = d.recent[d.recent.length - 1]?.month;
  const futureFrom = lastEst ? months.find((m) => m > lastEst) : undefined;
  const curvePts = new Map((curve?.points ?? []).map((p) => [p.month, p.value]));
  const color = seriesColor('model', 'COMBINE', mode);
  const fmt = (v: unknown) =>
    typeof v === 'number' ? `${fmtNum(v, d.unit === '$ pour 1 €' ? 3 : 1)} ${d.unit}` : '—';
  const areas: object[] = [];
  if (first && last)
    areas.push([
      {
        name: areaLabel(d.recent),
        xAxis: months.indexOf(first),
        itemStyle: { color: ink.neutral, opacity: 0.9 },
      },
      { xAxis: months.indexOf(last) },
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
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const ps = Array.isArray(params) ? params : [params];
        const m = months[ps[0]?.dataIndex ?? 0]!;
        const s = status.get(m);
        const lines = ps.map((p) => `${p.marker ?? ''}${p.seriesName} : <b>${fmt(p.value)}</b>`);
        return `<b>${fmtFixing(m)}</b>${s ? ` · ${statusLabel(s)}` : ''}<br/>${lines.join('<br/>')}`;
      },
    },
    series: [
      {
        name: `${d.label} (niveau du mois utilisé par le moteur)`,
        type: 'line',
        data: d.values,
        symbolSize: (_v: unknown, p: { dataIndex: number }) => (hollow(months[p.dataIndex]!) ? 9 : 5),
        symbol: 'circle',
        lineStyle: { width: MARKS.lineWidth, color },
        itemStyle: {
          color: (p: { dataIndex: number }) => (hollow(months[p.dataIndex]!) ? ink.surface : color),
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

// ------------------------------------------------------------------ mise à jour de la market data
export const SECTION_LABEL: Record<DiffRow['section'], string> = {
  scalar: 'Valeur plate',
  recent: 'Moyennes mensuelles récentes',
  curve: 'Courbes à terme (mois de livraison)',
};

/** Lignes qui changent vraiment (écart >= threshold %, ou valeur ajoutée / retirée), groupées par section. */
export function changedRows(rows: DiffRow[], threshold = 0.05): Record<DiffRow['section'], DiffRow[]> {
  const out: Record<DiffRow['section'], DiffRow[]> = { scalar: [], recent: [], curve: [] };
  for (const r of rows) {
    const added = (r.current === null) !== (r.proposed === null);
    if (added || (r.change_pct !== null && Math.abs(r.change_pct) >= threshold)) out[r.section].push(r);
  }
  return out;
}
