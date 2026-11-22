import { useState } from 'react';
import { useMeta, useScenarios } from '../api/hooks';
import type { Item } from '../api/types';
import { Chart } from '../charts/Chart';
import { QueryState } from '../components/QueryState';
import { Segmented } from '../components/Segmented';
import { fmtBp, fmtFixing, fmtPct, fmtPrice } from '../format';
import { ITEM_SHORT } from '../labels';
import { useApp } from '../store';
import { seriesColor } from '../theme';
import { useThemeMode } from '../useThemeMode';
import {
  gasoil,
  gasoilOption,
  KEY_FIXINGS,
  plotted,
  SCENARIO_ITEMS,
  spreadBp,
  value,
  yoyOption,
} from './scenarios/logic';

export function Scenarios() {
  const geo = useApp((s) => s.geo);
  const mode = useThemeMode();
  const meta = useMeta();
  const q = useScenarios(geo);
  const [item, setItem] = useState<Item>('TOT_X_TBC');
  const m = meta.data?.data;
  const geoName = m?.geos.find((g) => g.code === geo)?.name ?? geo;
  const all = m?.scenarios ?? [];
  const sc = plotted(all);
  const keys = sc.map((s) => s.key);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Scénarios énergie — {geoName}</h1>
        <p>
          Six règles de construction de la courbe gasoil, toutes choses égales par ailleurs (modèle BU). La
          forme de la courbe compte autant que son niveau.
        </p>
      </div>

      <QueryState q={q}>
        {(env) => {
          const rows = env.data;
          return (
            <>
              <section className="card">
                <div className="card-head">
                  <h2>Scénarios de courbe gasoil</h2>
                </div>
                <div className="scroll-x">
                  <table className="data" aria-label="Scénarios : règles et résultats">
                    <thead>
                      <tr>
                        <th>Scénario</th>
                        {KEY_FIXINGS.map((f) => (
                          <th key={`g${f}`}>Gasoil {fmtFixing(f)}</th>
                        ))}
                        {KEY_FIXINGS.map((f) => (
                          <th key={`y${f}`}>
                            {ITEM_SHORT[item]} {fmtFixing(f)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {all.map((s) => (
                        <tr key={s.key}>
                          <td style={{ whiteSpace: 'normal', minWidth: 260 }}>
                            <span
                              className="swatch"
                              style={{ background: seriesColor('scenario', s.key, mode) }}
                            />
                            <b>{s.key}</b> — {s.label}
                            {s.same_as && <em> (identique à « {s.same_as} », non tracé)</em>}
                          </td>
                          {KEY_FIXINGS.map((f) => (
                            <td key={`g${f}`}>{fmtPrice(gasoil(rows, s.key, f), '$/t')}</td>
                          ))}
                          {KEY_FIXINGS.map((f) => (
                            <td key={`y${f}`}>{fmtPct(value(rows, s.key, item, f))}</td>
                          ))}
                        </tr>
                      ))}
                      <tr className="total">
                        <td>Écart max − min (scénarios tracés)</td>
                        {KEY_FIXINGS.map((f) => (
                          <td key={`g${f}`} />
                        ))}
                        {KEY_FIXINGS.map((f) => (
                          <td key={`y${f}`}>{fmtBp(spreadBp(rows, keys, item, f))}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="card-foot">
                  Gasoil : niveau du mois utilisé par le moteur ($/t). Source : moteur euroinfl, run{' '}
                  {env.meta.run_id}.
                </div>
              </section>

              <div className="grid-2">
                <section className="card">
                  <div className="card-head">
                    <h2>Courbe gasoil utilisée ($/t)</h2>
                  </div>
                  <Chart ariaLabel="Courbe gasoil par scénario" option={gasoilOption(rows, sc, mode)} />
                </section>
                <section className="card">
                  <div className="card-head">
                    <h2>
                      {ITEM_SHORT[item]} {geoName} par scénario (%)
                    </h2>
                    <Segmented<Item>
                      ariaLabel="Indice affiché"
                      value={item}
                      onChange={setItem}
                      options={SCENARIO_ITEMS.map((i) => ({ value: i, label: ITEM_SHORT[i] }))}
                    />
                  </div>
                  <Chart
                    ariaLabel={`${ITEM_SHORT[item]} par scénario, ${geoName}`}
                    option={yoyOption(rows, sc, item, mode)}
                  />
                </section>
              </div>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
