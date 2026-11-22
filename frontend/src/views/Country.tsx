import { useComponents, useMeta } from '../api/hooks';
import { Chart } from '../charts/Chart';
import { QueryState } from '../components/QueryState';
import { fmtFixing, fmtPct, fmtPp } from '../format';
import { ITEM_SHORT } from '../labels';
import { useApp } from '../store';
import { neutralColor, seriesColor } from '../theme';
import { useThemeMode } from '../useThemeMode';
import {
  contribOf,
  contributionsOption,
  energyOption,
  fixingsOf,
  STACK,
  TABLE_ROWS,
  waterfallOption,
  yoyOf,
} from './country/logic';

export function Country() {
  const geo = useApp((s) => s.geo);
  const fixingSel = useApp((s) => s.fixing);
  const setFixing = useApp((s) => s.setFixing);
  const mode = useThemeMode();
  const meta = useMeta();
  const comp = useComponents(geo);
  const m = meta.data?.data;
  const geoName = m?.geos.find((g) => g.code === geo)?.name ?? geo;
  const w = m?.weights[geo];
  const indicativeFrom = m?.fixings.find((f) => f.indicative)?.period ?? null;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Pays — {geoName}</h1>
        <p>
          Décomposition de la prévision <b>bottom-up (BU)</b> : glissement annuel de chaque composante (%) et
          contribution au total (pp = poids 2026 × glissement annuel). La différence avec le total est le
          résidu de chaînage, affiché tel quel.
        </p>
      </div>

      <QueryState q={comp}>
        {(env) => {
          const rows = env.data;
          const fx = fixingsOf(rows);
          const fixing = fixingSel && fx.includes(fixingSel) ? fixingSel : fx[0]!;
          return (
            <>
              <section className="card">
                <div className="card-head">
                  <h2>Contributions à l'HICPxT {geoName} par composante (pp), modèle BU</h2>
                  <span className="badge">BU</span>
                </div>
                <Chart
                  ariaLabel={`Contributions par composante, ${geoName}`}
                  height={340}
                  option={contributionsOption(rows, mode)}
                />
                <div className="card-foot">
                  Barres : contributions en pp ; ligne : HICPxT BU en %. Poids 2026 hors tabac :{' '}
                  {w &&
                    STACK.filter((k) => k !== 'CHAIN_RESIDUAL')
                      .map(
                        (k) => `${ITEM_SHORT[k]} ${((w.top[k] ?? 0) * 100).toFixed(1).replace('.', ',')} %`,
                      )
                      .join(' · ')}
                  . Source : moteur euroinfl, run {env.meta.run_id}.
                </div>
              </section>

              <section className="card">
                <div className="card-head">
                  <h2>Glissement annuel par composante (%), modèle BU</h2>
                </div>
                <div className="scroll-x">
                  <table className="data" aria-label="Glissement annuel par composante et par fixing">
                    <thead>
                      <tr>
                        <th>Composante</th>
                        {fx.map((f) => (
                          <th key={f} className={f === fixing ? 'sel' : ''}>
                            <button className="linklike" onClick={() => setFixing(f)}>
                              {fmtFixing(f)}
                            </button>
                            {indicativeFrom && f >= indicativeFrom ? '*' : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {TABLE_ROWS.map(({ item, level }) => (
                        <tr key={item} className={level === 'total' ? 'total' : level === 'sub' ? 'sub' : ''}>
                          <td>
                            <span
                              className="swatch"
                              style={{
                                background:
                                  level === 'total'
                                    ? 'transparent'
                                    : level === 'sub'
                                      ? seriesColor('energy', item, mode)
                                      : seriesColor('component', item, mode),
                              }}
                            />
                            {ITEM_SHORT[item]}
                          </td>
                          {fx.map((f) => (
                            <td key={f} className={f === fixing ? 'sel' : ''}>
                              {fmtPct(yoyOf(rows, f, item))}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="card-foot">
                  * fixing indicatif (au-delà de h+10). Cliquer un fixing pour le pont.
                </div>
              </section>

              <div className="grid-2">
                <section className="card">
                  <div className="card-head">
                    <h2>Énergie : 4 sous-postes, glissement annuel (%)</h2>
                  </div>
                  <Chart ariaLabel={`Sous-postes énergie, ${geoName}`} option={energyOption(rows, mode)} />
                  <div className="card-foot">
                    Poids dans l'énergie :{' '}
                    {w &&
                      (['CP0722', 'CP0453', 'CP0452', 'CP0451'] as const)
                        .map((k) => `${ITEM_SHORT[k]} ${((w.energy[k] ?? 0) * 100).toFixed(0)} %`)
                        .join(' · ')}{' '}
                    · autres (solide, chaleur) {(((w?.energy.NRG_OTHER ?? 0) as number) * 100).toFixed(0)} %,
                    supposés suivre l'énergie modélisée.
                  </div>
                </section>

                <section className="card">
                  <div className="card-head">
                    <h2>Pont comptable {fmtFixing(fixing)} (pp)</h2>
                    <select
                      aria-label="Fixing du pont comptable"
                      value={fixing}
                      onChange={(e) => setFixing(e.target.value)}
                    >
                      {fx.map((f) => (
                        <option key={f} value={f}>
                          {fmtFixing(f)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Chart
                    ariaLabel={`Pont comptable ${fmtFixing(fixing)}, ${geoName}`}
                    option={waterfallOption(rows, fixing, mode)}
                  />
                  <table className="data" aria-label={`Pont comptable ${fmtFixing(fixing)}`}>
                    <tbody>
                      {STACK.map((k) => (
                        <tr key={k}>
                          <td>
                            <span
                              className="swatch"
                              style={{
                                background:
                                  k === 'CHAIN_RESIDUAL'
                                    ? neutralColor('residual', mode)
                                    : seriesColor('component', k, mode),
                              }}
                            />
                            {ITEM_SHORT[k]}
                          </td>
                          <td>{k === 'CHAIN_RESIDUAL' ? '' : fmtPct(yoyOf(rows, fixing, k))}</td>
                          <td>{fmtPp(contribOf(rows, fixing, k))}</td>
                        </tr>
                      ))}
                      <tr className="total">
                        <td>HICPxT (BU)</td>
                        <td />
                        <td>{fmtPct(yoyOf(rows, fixing, 'TOT_X_TBC'))}</td>
                      </tr>
                    </tbody>
                  </table>
                </section>
              </div>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
