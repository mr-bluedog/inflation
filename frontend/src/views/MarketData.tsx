import { useMarketPaths, useMeta } from '../api/hooks';
import type { Geo } from '../api/types';
import { Chart } from '../charts/Chart';
import { QueryState } from '../components/QueryState';
import { StatTile } from '../components/StatTile';
import { fmtDateFr, fmtFixing, fmtNum } from '../format';
import { useApp } from '../store';
import { useThemeMode } from '../useThemeMode';
import {
  at,
  digits,
  GROUPS,
  marketChartOption,
  ORIGIN_LABEL,
  SCENARIO_SHORT,
  tableRows,
  visibleDrivers,
} from './market/logic';

/** Mois des tuiles : prochain fixing, mi-2027, fin d'horizon. */
const KEY_MONTHS = ['2026-12', '2027-06', '2027-12'];
const KEY_DRIVERS = ['brent_usd', 'gasoil_usd_t', 'ttf', 'eurusd'];

export function MarketData() {
  const mode = useThemeMode();
  const geo = useApp((s) => s.geo);
  const scenario = useApp((s) => s.energyScenario);
  const meta = useMeta();
  const mp = useMarketPaths();
  const geoName = (g: Geo) => meta.data?.data.geos.find((x) => x.code === g)?.name ?? g;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Market data — hypothèses de marché du moteur</h1>
        <p>
          Trajectoire de chaque input de marché telle que le moteur l'utilise pour ses projections, dans le
          scénario énergie choisi en haut de page ({SCENARIO_SHORT[scenario] ?? scenario}). Valeur du mois M :
          contrat M+1 coté pendant M pour les prix de gros, moyenne des relevés de la semaine pour les prix à
          la pompe.
        </p>
      </div>

      <QueryState q={mp}>
        {(env) => {
          const m = env.data;
          const byKey = new Map(m.drivers.map((d) => [d.key, d]));
          const pump = visibleDrivers(m, geo).filter((d) => d.group === 'pompe');
          const tbl = tableRows(m, scenario, geo, '2026-08');
          return (
            <>
              <div className="tiles">
                {KEY_DRIVERS.map((k) => {
                  const d = byKey.get(k);
                  if (!d) return null;
                  const dg = digits(d.unit);
                  return (
                    <StatTile
                      key={k}
                      label={`${d.label} (${d.unit})`}
                      value={
                        <span className="num" style={{ fontSize: 18 }}>
                          {KEY_MONTHS.map((mo) => fmtNum(at(m, scenario, k, mo), dg)).join(' · ')}
                        </span>
                      }
                      sub={`${KEY_MONTHS.map(fmtFixing).join(' · ')}${d.scenario_dependent ? ' · dépend du scénario' : ''}`}
                    />
                  );
                })}
                {pump[0] && (
                  <StatTile
                    label={`Prix à la pompe ${geoName(geo)} (€/1 000 l)`}
                    value={
                      <span className="num" style={{ fontSize: 18 }}>
                        {pump.map((d) => fmtNum(at(m, scenario, d.key, '2026-12'), 0)).join(' · ')}
                      </span>
                    }
                    sub={`Essence · gazole · fioul, Dec-26 · dernier relevé WOB ${m.wob_last_week ? fmtDateFr(m.wob_last_week) : '—'}`}
                  />
                )}
              </div>

              {GROUPS.map((g) => {
                const ds = visibleDrivers(m, geo).filter((d) => d.group === g.key);
                return (
                  <section className="card" key={g.key}>
                    <div className="card-head">
                      <h2>
                        {g.label}
                        {g.key === 'pompe' ? ` — ${geoName(geo)}` : ''}
                      </h2>
                    </div>
                    <div className="grid-2">
                      {ds.map((d) => (
                        <div key={d.key}>
                          <h3 className="chart-title">
                            {d.label} ({d.unit})
                          </h3>
                          <Chart
                            ariaLabel={`${d.label} : trajectoire utilisée par le moteur`}
                            height={260}
                            option={marketChartOption(m, d, scenario, mode)}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="card-foot">
                      {g.note} Trait plein : base de données et mois observés (point creux : proxy, estimé ou
                      mois partiel) ; pointillés et zone grisée : projection du scénario choisi ; traits gris
                      : autres scénarios énergie.
                    </div>
                  </section>
                );
              })}

              <section className="card">
                <div className="card-head">
                  <h2>Hypothèses mois par mois — {SCENARIO_SHORT[scenario] ?? scenario}</h2>
                </div>
                <div className="scroll-x">
                  <table className="data" aria-label="Hypothèses de marché mois par mois">
                    <thead>
                      <tr>
                        <th>Input</th>
                        {tbl.months.map((mo) => (
                          <th key={mo}>{fmtFixing(mo)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tbl.rows.map((r) => (
                        <tr key={r.driver.key}>
                          <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
                            {r.driver.label} <span className="legend-note">({r.driver.unit})</span>
                          </td>
                          {r.cells.map((c, j) => (
                            <td
                              key={tbl.months[j]}
                              className={
                                c.origin === 'projection'
                                  ? 'projected'
                                  : c.origin !== 'base' && c.origin !== 'observe'
                                    ? 'estimated'
                                    : ''
                              }
                              title={`${ORIGIN_LABEL[c.origin]}${c.partial ? ' · partiel' : ''}`}
                            >
                              {c.origin === 'proxy' && '≈ '}
                              {fmtNum(c.value, digits(r.driver.unit))}
                              {c.origin === 'estime' && ' ⚠'}
                              {c.partial && '*'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="card-foot">
                  Fond grisé : projection (courbes à terme au {fmtDateFr(m.asof)}, règle du scénario pour le
                  gasoil, prolongement par le gros pour la pompe). ≈ : proxy (autre instrument) · ⚠ : estimé ·
                  * : mois en cours, moyenne partielle. Dernier mois de market data :{' '}
                  {fmtFixing(m.last_market_month)} ; dernier relevé WOB :{' '}
                  {m.wob_last_week ? fmtDateFr(m.wob_last_week) : '—'}. Source : /api/market/paths (moteur
                  euroinfl, run {env.meta.run_id}).
                </div>
              </section>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
