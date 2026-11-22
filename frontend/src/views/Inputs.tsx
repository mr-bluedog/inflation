import { useState } from 'react';
import { useMarketInputs, useSeries, useSeriesCatalog } from '../api/hooks';
import { Chart } from '../charts/Chart';
import { QueryState } from '../components/QueryState';
import { StatTile } from '../components/StatTile';
import { fmtDateFr, fmtFixing, fmtMonthFr, fmtNum, fmtPct } from '../format';
import { useThemeMode } from '../useThemeMode';
import { FixingsEditor } from './inputs/FixingsEditor';
import {
  CURVE_QUALITY_LABEL,
  driverOption,
  filterSeries,
  lastEstimated,
  QUALITY_LABEL,
  qualitySummary,
  seriesOption,
} from './inputs/logic';
import { MarketUpdate } from './inputs/MarketUpdate';

const RECENT_LABELS: Record<string, string> = {
  eurusd: 'EUR/USD',
  ttf: 'TTF',
  brent_usd: 'Brent',
  gasoil_usd_t: 'gasoil',
  power_de: 'électricité DE',
  power_fr: 'électricité FR',
};

const RECENT_COLS: { key: string; label: string; unit: string; digits: number }[] = [
  { key: 'ttf', label: 'TTF', unit: '€/MWh', digits: 1 },
  { key: 'power_de', label: 'Élec. DE', unit: '€/MWh', digits: 0 },
  { key: 'power_fr', label: 'Élec. FR', unit: '€/MWh', digits: 0 },
  { key: 'gasoil_usd_t', label: 'Gasoil', unit: '$/t', digits: 0 },
  { key: 'brent_usd', label: 'Brent', unit: '$/bbl', digits: 1 },
  { key: 'eurusd', label: 'EUR/USD', unit: '$', digits: 3 },
];

export function Inputs() {
  const mode = useThemeMode();
  const mkt = useMarketInputs();
  const [driver, setDriver] = useState('gasoil_usd_t');

  return (
    <div className="page">
      <div className="page-head">
        <h1>Inputs</h1>
        <p>
          Entrées du moteur : courbes à terme et moyennes mensuelles récentes (<code>market_inputs.json</code>
          ), hypothèses hors marché, et base de données macro.
        </p>
      </div>

      <MarketUpdate />
      <FixingsEditor />

      <QueryState q={mkt}>
        {(env) => {
          const m = env.data;
          const lastEst = lastEstimated(m.recent_months);
          const d = m.drivers.find((x) => x.key === driver) ?? m.drivers[0]!;
          const curve = m.curves.find((c) => c.key === d.key);
          const a = m.assumptions;
          const summary = qualitySummary(m.recent_months, RECENT_LABELS);
          const partialMonth = m.recent_months.find((r) => r.partial)?.month ?? null;
          return (
            <>
              <div className="tiles">
                <StatTile
                  label="Courbes au"
                  value={fmtDateFr(m.asof)}
                  sub={
                    m.refreshed
                      ? `Sources publiques, rafraîchies le ${fmtDateFr(m.refreshed)}`
                      : 'Archive ICE recalée (jeu d’origine)'
                  }
                />
                <StatTile
                  label="EUR/USD"
                  value={<span className="num">{fmtNum(m.eurusd, 3)}</span>}
                  sub="Tenu plat sur tout l'horizon"
                />
                <StatTile
                  label={`Mois après la base de données${m.recent_months.length ? ` (${fmtMonthFr(m.recent_months[0]!.month)} → ${fmtMonthFr(lastEst!)})` : ''}`}
                  value={
                    <span className={summary.estime ? 'estimated' : ''}>
                      {m.recent_months.length} mois{summary.estime ? ' ⚠' : ''}
                    </span>
                  }
                  sub={
                    <>
                      {(['observe', 'proxy', 'estime'] as const)
                        .filter((q) => summary[q])
                        .map((q) => `${QUALITY_LABEL[q]} : ${summary[q]!.join(', ')}`)
                        .join(' · ')}
                      {partialMonth && ` · ${fmtMonthFr(partialMonth)} partiel`}
                    </>
                  }
                />
                <StatTile
                  label="Hypothèses hors marché"
                  value={
                    <span className="num" style={{ fontSize: 15, lineHeight: 1.35, display: 'block' }}>
                      Mat. prem. {fmtPct(Number(a.food_commo_monthly_pct), 1)}/mois (alim.),{' '}
                      {fmtPct(Number(a.nonfood_commo_monthly_pct), 1)}/mois (ind.)
                    </span>
                  }
                  sub={
                    a.wage_growth_yoy === null
                      ? 'Salaires : dernier point du tracker BCE prolongé'
                      : `Salaires : ${fmtPct(Number(a.wage_growth_yoy), 1)} a/a`
                  }
                />
              </div>

              <section className="card">
                <div className="card-head">
                  <h2>
                    {d.label} ({d.unit}) : historique, mois récents, courbe
                  </h2>
                  <select aria-label="Driver" value={driver} onChange={(e) => setDriver(e.target.value)}>
                    {m.drivers.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Chart
                  ariaLabel={`Trajectoire de ${d.label}`}
                  height={340}
                  option={driverOption(d, curve, lastEst, mode)}
                />
                <div className="card-foot">
                  Trajectoire du scénario central telle qu'utilisée par le moteur (niveau du mois M = contrat
                  de livraison M+1). Zone grisée : mois postérieurs à la base de données (juillet 2026),
                  étiquetés selon leur origine ; point creux = valeur qui n'est pas une moyenne complète
                  observée (proxy, estimée ou mois partiel). Zone « courbe / hypothèse » : futur.{' '}
                  {m.curve_quality[d.key] &&
                    `Courbe à terme : ${CURVE_QUALITY_LABEL[m.curve_quality[d.key]!]}. `}
                  {d.key === 'ppi_energy' &&
                    'Le PPI énergie est prolongé par le modèle (étage 1) après sa dernière publication. '}
                  {d.key === 'gasoil_usd_t' &&
                    'Gasoil futur : règle du scénario central (voir Scénarios énergie). '}
                  {m.curve_method}
                </div>
              </section>

              <section className="card">
                <div className="card-head">
                  <h2>Moyennes mensuelles après la base de données</h2>
                </div>
                <div className="scroll-x">
                  <table className="data" aria-label="Moyennes mensuelles après la base de données">
                    <thead>
                      <tr>
                        <th>Mois</th>
                        {RECENT_COLS.map((c) => (
                          <th key={c.key}>
                            {c.label} ({c.unit})
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {m.recent_months.map((r) => (
                        <tr key={r.month}>
                          <td>
                            {fmtFixing(r.month)}
                            {r.partial && <span className="legend-note"> (partiel)</span>}
                          </td>
                          {RECENT_COLS.map((c) => {
                            const q = r.quality[c.key];
                            return (
                              <td
                                key={c.key}
                                className={q && q !== 'observe' ? 'estimated' : ''}
                                title={q ? QUALITY_LABEL[q] : undefined}
                              >
                                {q === 'proxy' && '≈ '}
                                {fmtNum(r.values[c.key], c.digits)}
                                {q === 'estime' && ' ⚠'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="card-foot">
                  Valeur sans marque : moyenne observée de l'instrument utilisé par le moteur · ≈ en italique
                  : proxy (cotations d'un autre instrument) · ⚠ : estimée à la main · partiel : mois en cours.{' '}
                  {m.recent_note}
                </div>
              </section>
            </>
          );
        }}
      </QueryState>

      <SeriesExplorer />
    </div>
  );
}

function SeriesExplorer() {
  const mode = useThemeMode();
  const cat = useSeriesCatalog();
  const [text, setText] = useState('');
  const [component, setComponent] = useState('');
  const [code, setCode] = useState('legacy_gas_1m');
  const series = useSeries(code);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Base de données : {cat.data?.data.length ?? '…'} séries</h2>
        <div className="toolbar">
          <input
            type="search"
            className="search"
            placeholder="Rechercher (code ou libellé)"
            aria-label="Rechercher une série"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <select aria-label="Composante" value={component} onChange={(e) => setComponent(e.target.value)}>
            <option value="">Toutes composantes</option>
            {[...new Set((cat.data?.data ?? []).map((s) => s.component ?? ''))].sort().map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <QueryState q={cat}>
        {(env) => {
          const list = filterSeries(env.data, text, component);
          return (
            <div className="grid-2">
              <div className="scroll-x series-list">
                <table className="data" aria-label="Catalogue des séries">
                  <thead>
                    <tr>
                      <th>Série</th>
                      <th>Fréq.</th>
                      <th>Fin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((s) => (
                      <tr key={s.code} className={s.code === code ? 'selected' : ''}>
                        <td style={{ whiteSpace: 'normal' }}>
                          <button className="linklike" onClick={() => setCode(s.code)}>
                            {s.label}
                          </button>
                          <div className="legend-note">
                            <code>{s.code}</code> · {s.geo} · {s.unit}
                          </div>
                        </td>
                        <td>{s.frequency}</td>
                        <td>{s.end}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {list.length === 0 && <div className="state">Aucune série.</div>}
              </div>
              <div>
                <QueryState q={series}>
                  {(sd) => (
                    <>
                      <h2 style={{ marginBottom: 4 }}>{sd.data.info.label}</h2>
                      <Chart
                        ariaLabel={`Série ${sd.data.info.code}`}
                        height={260}
                        option={seriesOption(sd.data, mode)}
                      />
                      <table className="data" aria-label="Métadonnées de la série">
                        <tbody>
                          {(
                            [
                              ['Code', sd.data.info.code],
                              ['Composante / rôle', `${sd.data.info.component} · ${sd.data.info.role}`],
                              ['Zone', sd.data.info.geo],
                              ['Unité', sd.data.info.unit],
                              ['Fréquence', sd.data.info.frequency],
                              [
                                'Période',
                                `${sd.data.info.start} → ${sd.data.info.end} (${sd.data.info.n} obs.)`,
                              ],
                              [
                                'Source',
                                `${sd.data.info.source_dataset} (mise à jour ${sd.data.info.source_update})`,
                              ],
                              ['Usage', sd.data.info.model_use],
                            ] as const
                          ).map(([k, v]) => (
                            <tr key={k}>
                              <td>{k}</td>
                              <td style={{ textAlign: 'left', whiteSpace: 'normal' }}>{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </QueryState>
              </div>
            </div>
          );
        }}
      </QueryState>
    </section>
  );
}
