import type { EChartsOption } from 'echarts';
import { useHeadline, useMeta } from '../api/hooks';
import type { HeadlineRow, ModelKey } from '../api/types';
import { axes } from '../charts/base';
import { Chart } from '../charts/Chart';
import { QueryState } from '../components/QueryState';
import { fmtBp, fmtFixing, fmtPct } from '../format';
import { useApp } from '../store';
import { MARKS, neutralColor, seriesColor, type Mode } from '../theme';
import { useThemeMode } from '../useThemeMode';
import { Placeholder } from './Placeholder';
import { VIEWS } from './registry';

function trajectoryOption(rows: HeadlineRow[], mode: Mode, selected: ModelKey): EChartsOption {
  const cats = rows.map((r) => fmtFixing(r.fixing));
  const models: ModelKey[] = ['COMBINE', 'BU', 'STAT'];
  const line = (m: ModelKey) => ({
    name: m,
    type: 'line' as const,
    data: rows.map((r) => r[m]),
    symbolSize: MARKS.symbolSize,
    lineStyle: { width: m === selected ? 3 : MARKS.lineWidth, color: seriesColor('model', m, mode) },
    itemStyle: { color: seriesColor('model', m, mode) },
  });
  return {
    ...axes(mode, cats, '%'),
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v) => fmtPct(typeof v === 'number' ? v : null),
    },
    series: [
      ...models.map(line),
      {
        name: 'Marché',
        type: 'line',
        data: rows.map((r) => r.market),
        symbol: 'none',
        lineStyle: { width: MARKS.lineWidth, type: 'dashed', color: neutralColor('market', mode) },
        itemStyle: { color: neutralColor('market', mode) },
      },
    ],
  };
}

export function Overview() {
  const view = VIEWS[0]!;
  const geo = useApp((s) => s.geo);
  const model = useApp((s) => s.model);
  const mode = useThemeMode();
  const meta = useMeta();
  const headline = useHeadline(geo);
  const geoName = meta.data?.data.geos.find((g) => g.code === geo)?.name ?? geo;

  return (
    <Placeholder view={view}>
      <section className="card">
        <div className="card-head">
          <h2>Contrôle du socle : trajectoire HICPxT {geoName}, glissement annuel (%)</h2>
          <span className="badge">provisoire</span>
        </div>
        <QueryState q={headline}>
          {(env) => {
            const first = env.data[0]!;
            return (
              <>
                <Chart
                  ariaLabel={`Trajectoire HICPxT ${geoName}, 14 fixings`}
                  option={trajectoryOption(env.data, mode, model)}
                />
                <p className="num">
                  {fmtFixing(first.fixing)} : COMBINE {fmtPct(first.COMBINE)} · marché {fmtPct(first.market)}{' '}
                  · écart {fmtBp(first.gap_bp)}
                </p>
                <div className="card-foot">
                  Source : moteur euroinfl, run {env.meta.run_id} · {env.meta.notes.join(' · ')}
                </div>
              </>
            );
          }}
        </QueryState>
      </section>
    </Placeholder>
  );
}
