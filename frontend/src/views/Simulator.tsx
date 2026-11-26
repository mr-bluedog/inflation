import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { EChartsOption } from 'echarts';
import { DATA_MODE } from '../api/client';
import { useHeadline, useMeta, useSensitivitiesAll, useSimulate } from '../api/hooks';
import { GEOS, type Geo, type Item } from '../api/types';
import { axes } from '../charts/base';
import { Chart } from '../charts/Chart';
import { fmtBp, fmtFixing, fmtNum, fmtPct } from '../format';
import { ITEM_SHORT } from '../labels';
import { useApp } from '../store';
import { divergingColor, INK, MARKS, neutralColor, seriesColor, type Mode } from '../theme';
import { useThemeMode } from '../useThemeMode';
import {
  activeShocks,
  clamp,
  exactMap,
  key3,
  linearImpact,
  parseSearch,
  PRESETS,
  SLIDERS,
  toSearch,
  type SimState,
} from './simulator/logic';

const DEBOUNCE_MS = 600;
const KEY_FIXINGS = ['2027-01', '2027-06', '2027-12'];
const DETAIL_ITEMS: Item[] = [
  'TOT_X_TBC',
  'NRG',
  'CP0722',
  'CP0453',
  'CP0452',
  'CP0451',
  'FOOD_P_X_TBC',
  'FOOD_NP',
  'IGD_NNRG',
  'SERV',
];
const SHOCK_SCALE_BP = 50;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function Simulator() {
  const [sp, setSp] = useSearchParams();
  const st = useMemo(() => parseSearch(sp), [sp]);
  const geo = useApp((s) => s.geo);
  const setSimSearch = useApp((s) => s.setSimSearch);
  const mode = useThemeMode();
  const meta = useMeta();
  const sens = useSensitivitiesAll();
  const headline = useHeadline(geo);
  const [auto, setAuto] = useState(true);

  const update = (next: SimState) => setSp(toSearch(next), { replace: true });
  useEffect(() => setSimSearch(sp.toString()), [sp, setSimSearch]);

  const active = activeShocks(st.shocks);
  const hasShock = Object.keys(active).length > 0;
  const body = { scenario: st.scenario, shocks: active, link_power: st.linkPower };
  const debounced = useDebounced(body, DEBOUNCE_MS);
  const exactWanted = DATA_MODE === 'api' && (hasShock || st.scenario !== 'central');
  const exact = useSimulate(debounced, exactWanted && auto);

  const linear = useMemo(
    () => (sens.data ? linearImpact(sens.data, st.shocks, st.linkPower) : null),
    [sens.data, st.shocks, st.linkPower],
  );
  // l'exact n'est affiché que s'il correspond aux curseurs actuels (pas de résultat périmé)
  const exactFresh =
    exact.data &&
    JSON.stringify(debounced) === JSON.stringify(body) &&
    exact.data.data.scenario === st.scenario &&
    exact.data.data.link_power === st.linkPower
      ? exactMap(exact.data.data.rows)
      : null;

  const geoName = (g: string) => meta.data?.data.geos.find((x) => x.code === g)?.name ?? g;
  const fixings = meta.data?.data.fixings.map((f) => f.period) ?? [];
  const lin = (g: string, it: string, f: string) => (hasShock ? (linear?.bp.get(key3(g, it, f)) ?? 0) : 0);
  const ex = (g: string, it: string, f: string) => exactFresh?.get(key3(g, it, f))?.delta_bp ?? null;
  const best = (g: string, it: string, f: string) => ex(g, it, f) ?? lin(g, it, f);
  const usingExact = exactFresh !== null;
  const approxLabel =
    st.scenario !== 'central' ? 'approximation (sensibilités du central)' : 'approximation linéaire';

  return (
    <div className="page">
      <div className="page-head">
        <h1>Simulateur de chocs</h1>
        <p>
          Chocs permanents sur les courbes de marché à partir de Dec-26 (salaires : dès Aug-26), modèle BU.
          Impact en bp de glissement annuel HICPxT.{' '}
          {DATA_MODE === 'static' && <b>Mode statique : approximation uniquement.</b>}
        </p>
      </div>

      <div className="sim-layout">
        <section className="card sim-controls" aria-label="Chocs">
          <div className="card-head">
            <h2>Chocs</h2>
            <button className="btn" onClick={() => update({ ...st, shocks: {} })} disabled={!hasShock}>
              Réinitialiser
            </button>
          </div>
          <div className="presets">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className="btn small"
                onClick={() => update({ ...p.state, scenario: st.scenario })}
              >
                {p.label}
              </button>
            ))}
          </div>
          {SLIDERS.map((d) => {
            const v = st.shocks[d.key] ?? 0;
            const set = (x: number) => update({ ...st, shocks: { ...st.shocks, [d.key]: clamp(d, x) } });
            return (
              <div key={d.key} className="slider">
                <label htmlFor={`sl-${d.key}`}>
                  {d.label}
                  {d.key === 'brent' && <span className="hint"> (exact seulement)</span>}
                </label>
                <input
                  id={`sl-${d.key}`}
                  type="range"
                  min={d.min}
                  max={d.max}
                  step={d.step}
                  value={Math.min(d.max, Math.max(d.min, v))}
                  onChange={(e) => set(Number(e.target.value))}
                />
                <span className="slider-value">
                  <input
                    type="number"
                    aria-label={`${d.label} (${d.unit})`}
                    value={v}
                    step={d.step}
                    onChange={(e) => set(Number(e.target.value) || 0)}
                  />
                  {d.unit}
                </span>
              </div>
            );
          })}
          <label className="check">
            <input
              type="checkbox"
              checked={st.linkPower}
              onChange={(e) => update({ ...st, linkPower: e.target.checked })}
            />
            Électricité de gros entraînée par le gaz (power DE × TTF^
            {fmtNum(meta.data?.data.power_link.power_de, 2)}, FR × TTF^
            {fmtNum(meta.data?.data.power_link.power_fr, 2)})
          </label>
          <label className="check">
            Scénario gasoil{' '}
            <select value={st.scenario} onChange={(e) => update({ ...st, scenario: e.target.value })}>
              {(meta.data?.data.scenarios ?? []).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.key}
                </option>
              ))}
            </select>
          </label>
          <div className="sim-status">
            {DATA_MODE === 'static' ? (
              <span className="badge static">Recalcul exact indisponible (mode statique)</span>
            ) : (
              <>
                <label className="check">
                  <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                  Recalcul exact automatique ({DEBOUNCE_MS} ms)
                </label>
                <button className="btn" onClick={() => void exact.refetch()} disabled={!exactWanted}>
                  Recalcul exact
                </button>
                <span className="legend-note" role="status">
                  {!exactWanted
                    ? 'Aucun choc'
                    : exact.isFetching
                      ? 'Calcul du moteur…'
                      : exact.isError
                        ? (exact.error as Error).message
                        : usingExact
                          ? 'Résultat exact du moteur'
                          : 'En attente'}
                </span>
              </>
            )}
          </div>
          {linear && linear.unsupported.length > 0 && (
            <p className="legend-note">
              Non inclus dans l'approximation (pas de sensibilité pré-calculée) :{' '}
              {linear.unsupported.join(', ')}.
            </p>
          )}
          <p className="legend-note">Lien partageable : l'adresse de la page contient les chocs.</p>
        </section>

        <div className="sim-results">
          <div className="tiles">
            {KEY_FIXINGS.map((f) => (
              <div className="tile" key={f}>
                <div className="tile-label">
                  Impact HICPxT {geo} {fmtFixing(f)}
                </div>
                <div className="tile-value num">{fmtBp(best(geo, 'TOT_X_TBC', f))}</div>
                <div className="tile-sub num">
                  {usingExact ? (
                    <>
                      exact · {approxLabel} {fmtBp(lin(geo, 'TOT_X_TBC', f))}
                    </>
                  ) : (
                    <i>{approxLabel}</i>
                  )}
                </div>
              </div>
            ))}
          </div>

          <section className="card">
            <div className="card-head">
              <h2>HICPxT {geoName(geo)} : base et choquée, glissement annuel (%), modèle BU</h2>
            </div>
            {headline.data && (
              <Chart
                ariaLabel={`Trajectoire base et choquée, ${geoName(geo)}`}
                option={trajectoryOption(
                  fixings,
                  (f) =>
                    exactFresh?.get(key3(geo, 'TOT_X_TBC', f))?.base ??
                    (st.scenario === 'central'
                      ? (headline.data!.data.find((r) => r.fixing === f)?.BU ?? null)
                      : null),
                  (f) => ex(geo, 'TOT_X_TBC', f),
                  (f) => lin(geo, 'TOT_X_TBC', f),
                  usingExact,
                  mode,
                )}
              />
            )}
            <div className="card-foot">
              Base : prévision BU ({st.scenario}). Trajectoire choquée = base + impact ; pointillé :{' '}
              {approxLabel}.
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Impact sur l'HICPxT par pays (bp) — {usingExact ? 'exact' : approxLabel}</h2>
            </div>
            <div className="scroll-x">
              <table className="data" aria-label="Impact par fixing et par pays">
                <thead>
                  <tr>
                    <th>Fixing</th>
                    {GEOS.map((g) => (
                      <th key={g} className={g === geo ? 'sel' : ''}>
                        {g}
                      </th>
                    ))}
                    {usingExact && (
                      <th title="exact − approximation, pays sélectionné">Écart {geo} lin. − exact</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {fixings.map((f) => (
                    <tr key={f}>
                      <td>{fmtFixing(f)}</td>
                      {GEOS.map((g: Geo) => {
                        const v = best(g, 'TOT_X_TBC', f);
                        return (
                          <td
                            key={g}
                            className={g === geo ? 'sel' : ''}
                            style={
                              hasShock
                                ? {
                                    background: divergingColor(v, SHOCK_SCALE_BP, mode),
                                    color: INK[mode].primary,
                                  }
                                : undefined
                            }
                          >
                            {fmtBp(v)}
                          </td>
                        );
                      })}
                      {usingExact && (
                        <td>{fmtBp(lin(geo, 'TOT_X_TBC', f) - (ex(geo, 'TOT_X_TBC', f) ?? 0))}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>
                Décomposition par sous-indice, {geoName(geo)} (bp de glissement annuel de chaque indice)
              </h2>
            </div>
            <div className="scroll-x">
              <table className="data" aria-label="Impact par sous-indice">
                <thead>
                  <tr>
                    <th>Sous-indice</th>
                    {KEY_FIXINGS.map((f) => (
                      <th key={f}>{fmtFixing(f)}</th>
                    ))}
                    {usingExact && KEY_FIXINGS.map((f) => <th key={`l${f}`}>approx. {fmtFixing(f)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {DETAIL_ITEMS.map((it) => (
                    <tr
                      key={it}
                      className={
                        it === 'TOT_X_TBC'
                          ? 'total'
                          : ['CP0722', 'CP0453', 'CP0452', 'CP0451'].includes(it)
                            ? 'sub'
                            : ''
                      }
                    >
                      <td>
                        <span
                          className="swatch"
                          style={{
                            background:
                              it === 'TOT_X_TBC'
                                ? 'transparent'
                                : ['CP0722', 'CP0453', 'CP0452', 'CP0451'].includes(it)
                                  ? seriesColor('energy', it, mode)
                                  : seriesColor('component', it, mode),
                          }}
                        />
                        {ITEM_SHORT[it]}
                      </td>
                      {KEY_FIXINGS.map((f) => (
                        <td key={f}>{fmtBp(best(geo, it, f))}</td>
                      ))}
                      {usingExact &&
                        KEY_FIXINGS.map((f) => (
                          <td key={`l${f}`} className="estimated">
                            {fmtBp(lin(geo, it, f))}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-foot">
              Impact sur le glissement annuel de chaque sous-indice (pas une contribution au total). Pour la
              prévision combinée, MODELES §8 recommande de multiplier par le poids w_BU.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function trajectoryOption(
  fixings: string[],
  base: (f: string) => number | null,
  exact: (f: string) => number | null,
  linear: (f: string) => number,
  usingExact: boolean,
  mode: Mode,
): EChartsOption {
  const add = (b: number | null, d: number | null) => (b === null || d === null ? null : b + d / 100);
  const color = seriesColor('model', 'COMBINE', mode);
  return {
    ...axes(mode, fixings.map(fmtFixing), '%'),
    tooltip: { trigger: 'axis', valueFormatter: (v) => fmtPct(typeof v === 'number' ? v : null) },
    series: [
      {
        name: 'Base',
        type: 'line',
        data: fixings.map(base),
        symbolSize: 6,
        lineStyle: { width: MARKS.lineWidth, color: neutralColor('history', mode) },
        itemStyle: { color: neutralColor('history', mode) },
      },
      ...(usingExact
        ? [
            {
              name: 'Choquée (exact)',
              type: 'line' as const,
              data: fixings.map((f) => add(base(f), exact(f))),
              symbolSize: MARKS.symbolSize,
              lineStyle: { width: 3, color },
              itemStyle: { color },
            },
          ]
        : []),
      {
        name: 'Choquée (approximation)',
        type: 'line',
        data: fixings.map((f) => add(base(f), linear(f))),
        symbolSize: 5,
        lineStyle: { width: MARKS.lineWidth, type: 'dashed', color },
        itemStyle: { color },
      },
    ],
  };
}
