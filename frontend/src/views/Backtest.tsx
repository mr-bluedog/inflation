import { useState } from 'react';
import { useBacktest, useBacktestErrors, useMeta } from '../api/hooks';
import { GEOS } from '../api/types';
import { Chart } from '../charts/Chart';
import { QueryState } from '../components/QueryState';
import { Segmented } from '../components/Segmented';
import { fmtNum } from '../format';
import { ITEM_SHORT, MODEL_LABEL } from '../labels';
import { useApp } from '../store';
import { useThemeMode } from '../useThemeMode';
import {
  errorsOption,
  KEY_H,
  modelsAvailable,
  rmse,
  rmseOption,
  weightsOption,
  SCORE_ITEMS,
  type Period,
} from './backtest/logic';
import { ScoreBoard } from './backtest/ScoreBoard';

const ITEMS = SCORE_ITEMS;
const pp = (v: number | null | undefined) => fmtNum(v, 2);
/** erreurs : pp → bp (1 pp = 100 bp de glissement annuel) */
const bp = (v: number | null | undefined, sign = false) =>
  v === null || v === undefined ? '—' : fmtNum(v * 100, 0, sign);

export function Backtest() {
  const geo = useApp((s) => s.geo);
  const mode = useThemeMode();
  const meta = useMeta();
  const q = useBacktest();
  const [item, setItem] = useState<string>('TOT_X_TBC');
  const [period, setPeriod] = useState<Period>('all');
  const [h, setH] = useState(1);
  const errs = useBacktestErrors(geo, h);
  const geoName = meta.data?.data.geos.find((g) => g.code === geo)?.name ?? geo;
  const geoNames = Object.fromEntries((meta.data?.data.geos ?? []).map((g) => [g.code, g.name]));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Backtest</h1>
        <p>
          Pseudo temps réel : à chaque origine, ré-estimation sur les données connues, prix de gros futurs
          figés au dernier niveau. h1 = premier mois non publié. Erreurs sur le glissement annuel, en pp.
        </p>
      </div>
      <QueryState q={q}>
        {(env) => {
          const bt = env.data;
          const models = modelsAvailable(bt.rmse, item, period);
          return (
            <>
              <div className="toolbar">
                <select
                  aria-label="Indice du backtest"
                  value={item}
                  onChange={(e) => setItem(e.target.value)}
                >
                  {ITEMS.map((i) => (
                    <option key={i} value={i}>
                      {ITEM_SHORT[i]}
                    </option>
                  ))}
                </select>
                <Segmented<Period>
                  ariaLabel="Période du backtest"
                  value={period}
                  onChange={setPeriod}
                  options={[
                    { value: 'all', label: 'Toute la période' },
                    { value: 'post2023', label: 'Depuis 2023' },
                  ]}
                />
                <span className="legend-note">
                  {bt.n_origins} origines, {bt.origins.replace('..', ' → ')}
                </span>
              </div>

              <ScoreBoard bt={bt} period={period} geoNames={geoNames} />

              <section className="card">
                <div className="card-head">
                  <h2>
                    RMSE par horizon : {ITEM_SHORT[item as keyof typeof ITEM_SHORT]} {geoName} (bp)
                  </h2>
                </div>
                <Chart
                  ariaLabel={`RMSE par horizon, ${geoName}`}
                  option={rmseOption(bt, geo, item, period, mode)}
                />
                <div className="card-foot">
                  BU prix parfaits (pointillé) : prix de gros réalisés, mesure la qualité de la transmission
                  seule. Naïf : glissement annuel inchangé. Combinaison : disponible pour l'HICPxT sur toute
                  la période.
                </div>
              </section>

              <section className="card">
                <div className="card-head">
                  <h2>
                    RMSE par pays et par modèle (bp) — {period === 'all' ? 'toute la période' : 'depuis 2023'}
                  </h2>
                </div>
                <div className="scroll-x">
                  <table className="data" aria-label="RMSE par pays et par modèle">
                    <thead>
                      <tr>
                        <th>Pays</th>
                        <th style={{ textAlign: 'left' }}>Modèle</th>
                        {KEY_H.map((x) => (
                          <th key={x}>h{x}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {GEOS.flatMap((g) =>
                        models.map((m, i) => (
                          <tr key={`${g}/${m}`} className={g === geo ? '' : 'sub'}>
                            <td>{i === 0 ? g : ''}</td>
                            <td style={{ textAlign: 'left' }}>{MODEL_LABEL[m] ?? m}</td>
                            {KEY_H.map((x) => (
                              <td key={x} className={g === geo ? 'sel' : ''}>
                                {bp(rmse(bt.rmse, g, item, m, period, x))}
                              </td>
                            ))}
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="card">
                <div className="card-head">
                  <h2>
                    Erreur sur chaque fixing HICPxT {geoName}, prévu à h{h} (prévu − réalisé, bp)
                  </h2>
                  <Segmented<string>
                    ariaLabel="Horizon des erreurs"
                    value={String(h)}
                    onChange={(v) => setH(Number(v))}
                    options={KEY_H.map((x) => ({ value: String(x), label: `h${x}` }))}
                  />
                </div>
                <QueryState q={errs}>
                  {(e) => (
                    <Chart
                      ariaLabel={`Erreurs par origine, ${geoName}, h${h}`}
                      option={errorsOption(e.data, mode)}
                    />
                  )}
                </QueryState>
                <div className="card-foot">
                  Erreur positive = prévision trop haute. Origine = dernier HICP connu ; cible = origine + h.
                </div>
              </section>

              <div className="grid-2">
                <section className="card">
                  <div className="card-head">
                    <h2>Poids du BU dans la combinaison, par horizon</h2>
                  </div>
                  <Chart
                    ariaLabel="Poids de combinaison par pays"
                    option={weightsOption(bt.combo_weights, mode)}
                  />
                  <div className="card-foot">
                    COMBINE = w·BU + (1 − w)·STAT ; w = moyenne des poids optimaux « toute période » et «
                    depuis 2023 », bornée à [0,2 ; 1] et lissée sur 3 horizons (summarize_backtest.py).
                  </div>
                </section>
                <section className="card">
                  <div className="card-head">
                    <h2>Poids bruts {geo} : toute période / depuis 2023</h2>
                  </div>
                  <table className="data" aria-label="Poids bruts de combinaison">
                    <thead>
                      <tr>
                        <th>Horizon</th>
                        <th>Toute période</th>
                        <th>Depuis 2023</th>
                        <th>Retenu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(bt.combo_detail[geo] ?? []).map((d, i) => (
                        <tr key={i}>
                          <td>h{i + 1}</td>
                          <td>{pp(d[0])}</td>
                          <td>{pp(d[1])}</td>
                          <td>
                            <b>{pp(bt.combo_weights[geo]?.[i])}</b>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>

              <section className="card">
                <div className="card-head">
                  <h2>
                    Biais moyen depuis 2023 : {ITEM_SHORT[item as keyof typeof ITEM_SHORT]} {geoName} (bp)
                  </h2>
                </div>
                <table className="data" aria-label="Biais depuis 2023">
                  <thead>
                    <tr>
                      <th>Modèle</th>
                      {KEY_H.map((x) => (
                        <th key={x}>h{x}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modelsAvailable(bt.bias_post2023, item, 'post2023').map((m) => (
                      <tr key={m}>
                        <td>{MODEL_LABEL[m] ?? m}</td>
                        {KEY_H.map((x) => (
                          <td key={x}>{bp(rmse(bt.bias_post2023, geo, item, m, 'post2023', x), true)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="card-foot">
                  Biais négatif = sous-estimation. Source : out/backtest_summary.json.
                </div>
              </section>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
