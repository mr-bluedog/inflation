/** Market data : trajectoires des inputs de marché utilisées par le moteur, par scénario énergie.
 * Affichage seul : toutes les valeurs viennent de /api/market/paths (moteur), aucun recalcul. */
import type { EChartsOption } from 'echarts';
import type { Geo, MarketGroup, MarketOrigin, MarketPathDriver, MarketPaths } from '../../api/types';
import { axes } from '../../charts/base';
import { fmtFixing, fmtNum } from '../../format';
import { INK, MARKS, neutralColor, seriesColor, type Mode } from '../../theme';

/** Libellés courts des scénarios énergie (sélecteur de l'en-tête). */
export const SCENARIO_SHORT: Record<string, string> = {
  central: 'Central (WOB plat 3 mois → ICE)',
  flat: 'Front constant',
  full: 'Courbe ICE complète',
  flat3_trend: '3 mois plats + tendance',
  brent_crack: 'Brent + crack, gel après 3',
  brent_crack_full: 'Brent futures + crack',
};

export const GROUPS: { key: MarketGroup; label: string; note: string }[] = [
  {
    key: 'petrole',
    label: 'Pétrole et change',
    note: 'Brent : contrats mensuels. Gasoil : seul input qui dépend du scénario énergie.',
  },
  {
    key: 'pompe',
    label: 'Prix à la pompe (Weekly Oil Bulletin)',
    note: 'Relevés hebdomadaires TTC moyennés par mois, puis prolongés par le prix de gros (gazole, fioul : gasoil ; essence : Brent).',
  },
  {
    key: 'gaz_elec',
    label: 'Gaz et électricité',
    note: 'Transmis aux factures aux mois de révision des contrats (MODELES §4.2-4.3).',
  },
];

export const ORIGIN_LABEL: Record<MarketOrigin, string> = {
  base: 'base de données',
  observe: 'observé',
  proxy: 'proxy',
  estime: 'estimé',
  projection: 'projection',
};

/** Décimales d'affichage selon l'unité. */
export function digits(unit: string): number {
  return unit.startsWith('$ pour') ? 3 : unit === '€/1 000 l' || unit === '$/t' || unit === '€/t' ? 0 : 1;
}

/** Inputs affichés : prix à la pompe de la zone choisie seulement. */
export function visibleDrivers(mp: MarketPaths, geo: Geo): MarketPathDriver[] {
  return mp.drivers.filter((d) => d.group !== 'pompe' || d.geo === geo);
}

export function values(mp: MarketPaths, scenario: string, key: string): (number | null)[] {
  return mp.paths[scenario]?.[key] ?? mp.paths.central?.[key] ?? [];
}

/** Index du premier mois de projection (courbes, règle de scénario ou prolongement). */
export function firstProjection(d: MarketPathDriver): number {
  const i = d.origin.indexOf('projection');
  return i < 0 ? d.origin.length : i;
}

/** Graphe d'un input : réalisé / observé en trait plein, projection en pointillés,
 * autres scénarios en fin trait gris si l'input en dépend. */
export function marketChartOption(
  mp: MarketPaths,
  d: MarketPathDriver,
  scenario: string,
  mode: Mode,
  compact = false,
): EChartsOption {
  const ink = INK[mode];
  const v = values(mp, scenario, d.key);
  const p = firstProjection(d);
  const color = seriesColor('model', 'COMBINE', mode);
  const dg = digits(d.unit);
  const past = v.map((x, i) => (i < p ? x : null));
  const proj = v.map((x, i) => (i >= p - 1 ? x : null)); // relié au dernier point réalisé
  const hollow = (i: number) => d.origin[i] !== 'base' && (d.origin[i] !== 'observe' || d.partial[i]);
  const others =
    d.scenario_dependent && !compact
      ? mp.scenarios
          .filter((s) => s.key !== scenario && s.key !== 'flat3_trend')
          .map((s) => ({
            name: SCENARIO_SHORT[s.key] ?? s.key,
            type: 'line' as const,
            data: values(mp, s.key, d.key).map((x, i) => (i >= p - 1 ? x : null)),
            showSymbol: false,
            lineStyle: { width: 1, color: neutralColor('market', mode), opacity: 0.55 },
            itemStyle: { color: neutralColor('market', mode) },
            z: 1,
          }))
      : [];
  return {
    ...axes(mode, mp.months.map(fmtFixing), d.unit),
    grid: compact
      ? { top: 28, left: 8, right: 8, bottom: 4, containLabel: true }
      : { top: 32, left: 8, right: 12, bottom: 8, containLabel: true },
    legend: { show: false }, // titre au-dessus du graphe ; l'infobulle nomme chaque courbe
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const ps = (Array.isArray(params) ? params : [params]).filter((x) => typeof x.value === 'number');
        const i = (Array.isArray(params) ? params[0] : params)?.dataIndex ?? 0;
        const o = d.origin[i] ?? 'projection';
        const head = `<b>${fmtFixing(mp.months[i] ?? '')}</b> · ${ORIGIN_LABEL[o]}${d.partial[i] ? ' · partiel' : ''}`;
        const seen = new Set<string>();
        const lines = ps
          .filter((x) => !seen.has(x.seriesName ?? '') && seen.add(x.seriesName ?? ''))
          .map((x) => `${x.marker ?? ''}${x.seriesName} : <b>${fmtNum(x.value as number, dg)} ${d.unit}</b>`);
        return [head, ...lines].join('<br/>');
      },
    },
    series: [
      ...others,
      {
        name: compact ? d.label : `${d.label} · réalisé / observé`,
        type: 'line',
        data: past,
        symbol: 'circle',
        symbolSize: (_x: unknown, q: { dataIndex: number }) => (hollow(q.dataIndex) ? 7 : 3),
        lineStyle: { width: MARKS.lineWidth, color },
        itemStyle: {
          color: (q: { dataIndex: number }) => (hollow(q.dataIndex) ? ink.surface : color),
          borderColor: color,
          borderWidth: 1.5,
        },
        z: 3,
      },
      {
        name: compact
          ? `${d.label} (projection)`
          : `${d.label} · projection (${SCENARIO_SHORT[scenario] ?? scenario})`,
        type: 'line',
        data: proj,
        showSymbol: !compact,
        symbolSize: 3,
        lineStyle: { width: MARKS.lineWidth, color, type: 'dashed' },
        itemStyle: { color },
        z: 3,
        markArea:
          p < mp.months.length
            ? {
                silent: true,
                itemStyle: { color: ink.neutral, opacity: 0.35 },
                label: { show: !compact, color: ink.muted, fontSize: 11, position: 'insideTop' },
                data: [[{ name: 'projection', xAxis: p }, { xAxis: mp.months.length - 1 }]] as never,
              }
            : undefined,
      },
    ],
  };
}

/** Lignes du tableau : un input par ligne, colonnes = mois de `from` à la fin. */
export function tableRows(mp: MarketPaths, scenario: string, geo: Geo, from: string) {
  const start = Math.max(0, mp.months.indexOf(from));
  const months = mp.months.slice(start);
  return {
    months,
    rows: visibleDrivers(mp, geo).map((d) => ({
      driver: d,
      cells: months.map((_, j) => ({
        value: values(mp, scenario, d.key)[start + j] ?? null,
        origin: d.origin[start + j] ?? 'projection',
        partial: d.partial[start + j] ?? false,
      })),
    })),
  };
}

/** Valeurs clés d'un input à quelques mois (tuiles). */
export function at(mp: MarketPaths, scenario: string, key: string, month: string): number | null {
  const i = mp.months.indexOf(month);
  return i < 0 ? null : (values(mp, scenario, key)[i] ?? null);
}
