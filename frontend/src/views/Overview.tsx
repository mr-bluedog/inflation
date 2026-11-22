import { useHeadline, useHeadlineAll, useHistory, useMeta } from '../api/hooks';
import { GEOS, type Geo } from '../api/types';
import { Chart } from '../charts/Chart';
import { QueryState } from '../components/QueryState';
import { StatTile } from '../components/StatTile';
import { fmtBp, fmtFixing, fmtMonthFr, fmtPct } from '../format';
import { useApp } from '../store';
import { divergingColor, INK } from '../theme';
import { useThemeMode } from '../useThemeMode';
import { fixingTable, HISTORY_FROM, kpis, modelTitle, trajectoryOption } from './overview/logic';

const GAP_SCALE_BP = 30; // saturation de la carte de chaleur (bp)

export function Overview() {
  const geo = useApp((s) => s.geo);
  const setGeo = useApp((s) => s.setGeo);
  const model = useApp((s) => s.model);
  const mode = useThemeMode();
  const meta = useMeta();
  const headline = useHeadline(geo);
  const history = useHistory(geo, 'TOT_X_TBC', HISTORY_FROM);
  const all = useHeadlineAll();

  const m = meta.data?.data;
  const geoName = (g: Geo) => m?.geos.find((x) => x.code === g)?.name ?? g;
  const indicativeFrom = m?.fixings.find((f) => f.indicative)?.period ?? null;
  const marketGeos = m?.market_geos ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <h1>Vue d'ensemble — {geoName(geo)}</h1>
        <p>
          Prévision HICPxT (glissement annuel, %) des 14 fixings, modèle affiché : {modelTitle(model)}. Le
          marché sert uniquement de comparaison.
        </p>
      </div>

      <QueryState q={headline}>
        {(hl) => {
          const k = kpis(history.data?.data ?? [], hl.data, model);
          return (
            <div className="tiles">
              <StatTile
                label={`Dernier HICPxT publié${k.lastObs ? ` (${fmtMonthFr(k.lastObs.period)})` : ''}`}
                value={<span className="num">{fmtPct(k.lastObs?.yoy)}</span>}
                sub="Eurostat, glissement annuel"
              />
              <StatTile
                label={`Prochain fixing ${k.next ? fmtFixing(k.next.fixing) : ''} · ${model}`}
                value={<span className="num">{fmtPct(k.value)}</span>}
                sub={
                  k.next && (
                    <span className="num">
                      BU {fmtPct(k.next.BU)} · STAT {fmtPct(k.next.STAT)} · poids BU{' '}
                      {(k.next.w_BU * 100).toFixed(0)} %
                    </span>
                  )
                }
              />
              <StatTile
                label={`Marché ${k.next ? fmtFixing(k.next.fixing) : ''}`}
                value={<span className="num">{fmtPct(k.next?.market)}</span>}
                sub={
                  k.next?.market == null
                    ? 'Pas de cotation pour ce pays'
                    : 'Fixing HICPxT saisi le 20/11/2026'
                }
              />
              <StatTile
                label="Écart modèle − marché"
                value={
                  <span className="num">
                    {k.next?.market == null || k.value === null
                      ? '—'
                      : fmtBp((k.value - k.next.market) * 100)}
                  </span>
                }
                sub={`${model} − marché, en points de base`}
              />
            </div>
          );
        }}
      </QueryState>

      <section className="card">
        <div className="card-head">
          <h2>Trajectoire HICPxT {geoName(geo)} : publié puis prévu, glissement annuel (%)</h2>
        </div>
        <QueryState q={headline}>
          {(hl) => (
            <QueryState q={history}>
              {(hi) => (
                <>
                  <Chart
                    ariaLabel={`Trajectoire HICPxT ${geoName(geo)} : historique et 14 fixings`}
                    height={360}
                    option={trajectoryOption(hi.data, hl.data, model, mode, indicativeFrom)}
                  />
                  <div className="card-foot">
                    Historique : Eurostat (vintage {m?.dates.hicp_vintage}), glissement calculé en niveaux sur
                    t−12. Prévisions : moteur euroinfl, run {hl.meta.run_id}. Zone grisée : fixings au-delà de
                    h+10 (indicatifs). Molette ou pincement pour zoomer.
                  </div>
                </>
              )}
            </QueryState>
          )}
        </QueryState>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>14 fixings × 5 pays — {modelTitle(model)}, glissement annuel (%)</h2>
          <span className="legend-note">
            Écart au marché : <span className="swatch" style={{ background: divergingColor(-1, 1, mode) }} />
            modèle sous le marché ·{' '}
            <span className="swatch" style={{ background: divergingColor(1, 1, mode) }} />
            au-dessus (saturé à ±{GAP_SCALE_BP} bp)
          </span>
        </div>
        {all.isPending ? (
          <div className="state">Chargement…</div>
        ) : all.error || !all.data ? (
          <div className="state error">{String(all.error ?? 'Erreur de chargement')}</div>
        ) : (
          <div className="scroll-x">
            <table className="data" aria-label="Prévisions par fixing et par pays">
              <thead>
                <tr>
                  <th>Fixing</th>
                  {GEOS.map((g) => (
                    <th key={g} className={g === geo ? 'sel' : ''} title={geoName(g)}>
                      <button className="linklike" onClick={() => setGeo(g)}>
                        {g}
                      </button>
                    </th>
                  ))}
                  {marketGeos.map((g) => (
                    <th key={`mk-${g}`}>Marché {g}</th>
                  ))}
                  {marketGeos.map((g) => (
                    <th key={`gap-${g}`}>Écart {g} (bp)</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fixingTable(all.data, model).map((r) => (
                  <tr
                    key={r.fixing}
                    className={indicativeFrom && r.fixing >= indicativeFrom ? 'indicative' : ''}
                  >
                    <td>{fmtFixing(r.fixing)}</td>
                    {GEOS.map((g) => (
                      <td key={g} className={g === geo ? 'sel' : ''}>
                        {fmtPct(r.values[g])}
                      </td>
                    ))}
                    {marketGeos.map((g) => (
                      <td key={`mk-${g}`}>{fmtPct(r.market)}</td>
                    ))}
                    {marketGeos.map((g) => (
                      <td
                        key={`gap-${g}`}
                        style={
                          r.gapBp === null
                            ? undefined
                            : {
                                background: divergingColor(r.gapBp, GAP_SCALE_BP, mode),
                                color: INK[mode].primary,
                              }
                        }
                      >
                        {fmtBp(r.gapBp)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-foot">
          {m?.market_note}. Fixings marché disponibles pour : {marketGeos.join(', ') || 'aucun pays'}. Cliquer
          sur un pays pour le sélectionner.
        </div>
      </section>
    </div>
  );
}
