import { useRef, useState } from 'react';
import {
  useElasticities,
  useEquation,
  useEquationIndex,
  useMeta,
  usePassthrough,
  usePassthroughMany,
} from '../api/hooks';
import { GEOS, type Item } from '../api/types';
import { Chart } from '../charts/Chart';
import { QueryState } from '../components/QueryState';
import { Segmented } from '../components/Segmented';
import { fmtNum, fmtPct } from '../format';
import { frBuckets, ITEM_SHORT, SHOCK_SHORT, STAGE1_ITEMS } from '../labels';
import { useApp } from '../store';
import { useThemeMode } from '../useThemeMode';
import {
  currentPassthrough,
  elasticity,
  itemLabel,
  levelAt,
  bucketWindow,
  parseBuckets,
  profileOption,
  seasonOption,
  shocksOf,
  termsView,
  ZOOM_COMPARE,
  ZOOM_IT_ITEMS,
  ZOOM_MONTHS,
  ZOOM_PAIRS,
  ZOOM_SHOCK,
  type ProfileUnit,
} from './passthrough/logic';

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
const STAGE1 = 'EA-stage1';
const pp2 = (v: number | null | undefined) => fmtNum(v, 2);

export function PassThrough() {
  const [eqSel, setEqSel] = useState<{ geo: string; item: string } | null>(null);
  const eqRef = useRef<HTMLElement>(null);
  const openEquation = (geo: string, item: string) => {
    setEqSel({ geo: geo === 'EA (étage 1)' ? STAGE1 : geo, item });
    eqRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div className="page">
      <div className="page-head">
        <h1>Pass-through</h1>
        <p>
          Comment un choc sur un prix de gros se transmet aux prix de détail : profils de niveau, élasticités
          estimées (régime actuel contre avant 2023) et équation de chaque sous-indice. Modèle BU.
        </p>
      </div>
      <ItalyZoom />
      <Profiles />
      <Elasticities onOpen={openEquation} />
      <section ref={eqRef} className="card" style={{ scrollMarginTop: 16 }}>
        <EquationExplorer sel={eqSel} onSel={setEqSel} />
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ zoom Italie gaz
function ItalyZoom() {
  const meta = useMeta();
  const z = usePassthroughMany(ZOOM_PAIRS, ZOOM_SHOCK);
  const el = useElasticities();
  const w = meta.data?.data.weights.IT;
  const geoName = (g: string) => meta.data?.data.geos.find((x) => x.code === g)?.name ?? g;

  if (z.isPending || el.isPending) return <div className="card state">Chargement…</div>;
  if (!z.data || !el.data) return <div className="card state error">{String(z.error ?? el.error)}</div>;
  const d = z.data;
  const at = (g: string, i: string, m: number) => levelAt(d[`${g}/${i}`], m);
  const gas = elasticity(el.data.data, 'IT', 'CP0452', 'ttf');
  const elec = elasticity(el.data.data, 'IT', 'CP0451', 'ttf');
  const gasB = gas ? parseBuckets(gas.buckets) : [];
  const elecB = elec ? parseBuckets(elec.buckets) : [];
  const win = bucketWindow;
  const wpct = (v: number | undefined) => `${fmtNum((v ?? 0) * 100, 0)} %`;

  return (
    <section className="card" aria-labelledby="zoom-it">
      <div className="card-head">
        <h2 id="zoom-it">Zoom : TTF +10 % durable (électricité de gros entraînée), prix italiens</h2>
        <span className="badge">MODELES §11</span>
      </div>
      <div className="grid-2">
        <div className="scroll-x">
          <table className="data" aria-label="Zoom Italie gaz : variation du niveau des indices">
            <thead>
              <tr>
                <th>Variation du niveau (%) n mois après le début du choc</th>
                {ZOOM_MONTHS.map((m) => (
                  <th key={m}>{m} mois</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ZOOM_IT_ITEMS.map((i) => (
                <tr
                  key={i}
                  className={
                    i === 'TOT_X_TBC' ? 'total' : ['CP0452', 'CP0451', 'NRG'].includes(i) ? '' : 'sub'
                  }
                >
                  <td>
                    {i === 'TOT_X_TBC' ? 'HICPxT Italie' : `${ITEM_SHORT[i]} IT`}
                    {['FOOD_P_X_TBC', 'FOOD_NP', 'IGD_NNRG', 'SERV'].includes(i) ? ' (indirect)' : ''}
                  </td>
                  {ZOOM_MONTHS.map((m) => (
                    <td key={m}>{fmtPct(at('IT', i, m), 2, true)}</td>
                  ))}
                </tr>
              ))}
              {ZOOM_COMPARE.map((g) => (
                <tr key={g} className="sub">
                  <td>HICPxT {geoName(g)}</td>
                  {ZOOM_MONTHS.map((m) => (
                    <td key={m}>{fmtPct(at(g, 'TOT_X_TBC', m), 2, true)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ol className="steps">
          <li>
            <b>TTF → gaz de détail</b> : élasticité{' '}
            {gasB.map((b) => `${fmtNum(b.value, 3)} sur ${win(b)}`).join(', ')}, total{' '}
            <b>{pp2(gas?.sum_current)}</b> (avant 2023 : {pp2(gas?.sum_old_regime)}), soit{' '}
            {fmtPct(at('IT', 'CP0452', 11), 2, true)} après 11 mois.
          </li>
          <li>
            <b>TTF → prix de gros italien → électricité de détail</b> : élasticité{' '}
            <b>{pp2(elec?.sum_current)}</b> (dont {fmtNum(elecB[0]?.value, 3)} sur{' '}
            {elecB[0] ? win(elecB[0]) : '—'}
            ), soit {fmtPct(at('IT', 'CP0451', 11), 2, true)}.
          </li>
          <li>
            <b>Énergie</b> = {wpct(w?.energy.CP0452)} × gaz + {wpct(w?.energy.CP0451)} × électricité +{' '}
            {wpct(w?.energy.CP0722)} × carburants (inchangés) + …, soit {fmtPct(at('IT', 'NRG', 11), 2, true)}
            .
          </li>
          <li>
            <b>HICPxT</b> = {fmtNum((w?.top.NRG ?? 0) * 100, 1)} % (poids énergie) × énergie + effets
            indirects, soit <b>{fmtPct(at('IT', 'TOT_X_TBC', 11), 2, true)}</b> du niveau après 11 mois,
            contre {fmtPct(at('EA', 'TOT_X_TBC', 11), 2, true)} pour la zone euro.
          </li>
        </ol>
      </div>
      <div className="card-foot">
        Choc permanent sur toute la courbe à partir de Dec-26 ; « n mois » = rang du fixing (0 = Nov-26).
        Source : /api/passthrough (choc {ZOOM_SHOCK}), /api/elasticities, poids 2026.
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ profils
function Profiles() {
  const geo = useApp((s) => s.geo);
  const mode = useThemeMode();
  const meta = useMeta();
  const [item, setItem] = useState<Item>('NRG');
  const [unit, setUnit] = useState<ProfileUnit>('level');
  const q = usePassthrough(geo, item);
  const labels = SHOCK_SHORT;
  const geoName = meta.data?.data.geos.find((g) => g.code === geo)?.name ?? geo;

  return (
    <section className="card">
      <div className="card-head">
        <h2>
          Profils de pass-through : {ITEM_SHORT[item]} {geoName}
        </h2>
        <div className="toolbar">
          <select aria-label="Sous-indice" value={item} onChange={(e) => setItem(e.target.value as Item)}>
            {DETAIL_ITEMS.map((i) => (
              <option key={i} value={i}>
                {ITEM_SHORT[i]}
              </option>
            ))}
          </select>
          <Segmented<ProfileUnit>
            ariaLabel="Unité du profil"
            value={unit}
            onChange={setUnit}
            options={[
              { value: 'level', label: '% de niveau' },
              { value: 'elasticity', label: 'Élasticité' },
            ]}
          />
        </div>
      </div>
      <QueryState q={q}>
        {(env) => (
          <>
            <Chart
              ariaLabel={`Profils de pass-through, ${ITEM_SHORT[item]} ${geoName}`}
              height={340}
              option={profileOption(env.data, shocksOf(env.data), labels, unit, mode)}
            />
            <div className="card-foot">
              Variation du niveau de l'indice par rapport au central, pour un choc permanent de +10 %
              (salaires : +1 pp/an) à partir de Dec-26. Élasticité = niveau ÷ 10 (sans objet pour les
              salaires). Horizon limité à 13 mois par les 14 fixings. TTF seul en pointillé.
            </div>
          </>
        )}
      </QueryState>
    </section>
  );
}

// ------------------------------------------------------------------ élasticités
function Elasticities({ onOpen }: { onOpen: (geo: string, item: string) => void }) {
  const geo = useApp((s) => s.geo);
  const [scope, setScope] = useState<'geo' | 'all'>('geo');
  const q = useElasticities();
  return (
    <section className="card">
      <div className="card-head">
        <h2>Élasticités estimées {scope === 'geo' ? `— ${geo} et étage 1 (EA)` : '— tous les pays'}</h2>
        <Segmented<'geo' | 'all'>
          ariaLabel="Périmètre des élasticités"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'geo', label: geo },
            { value: 'all', label: 'Tous' },
          ]}
        />
      </div>
      <QueryState q={q}>
        {(env) => {
          const rows = env.data.filter((r) => scope === 'all' || r.geo === geo || r.geo.startsWith('EA ('));
          return (
            <div className="scroll-x">
              <table className="data" aria-label="Élasticités estimées">
                <thead>
                  <tr>
                    <th>Pays</th>
                    <th>Sous-indice</th>
                    <th style={{ textAlign: 'left' }}>Driver</th>
                    <th title="Σ β (+ γ si régime actif)">Pass-through actuel</th>
                    <th>Avant 2023</th>
                    <th title="Σ / (1 − ρ)">Long terme</th>
                    <th>ρ</th>
                    <th>R²</th>
                    <th>n</th>
                    <th style={{ textAlign: 'left' }}>Fenêtres (régime actuel)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.geo}/${r.item}/${r.driver}`}>
                      <td>{r.geo}</td>
                      <td>
                        <button
                          className="linklike"
                          onClick={() => onOpen(r.geo, r.item)}
                          title="Voir l'équation"
                        >
                          {itemLabel(r.item)}
                        </button>
                      </td>
                      <td style={{ textAlign: 'left' }}>{itemLabel(r.driver)}</td>
                      <td>
                        <b>{pp2(r.sum_current)}</b>
                      </td>
                      <td>{pp2(r.sum_old_regime)}</td>
                      <td>{pp2(r.long_run_current)}</td>
                      <td>{pp2(r.rho)}</td>
                      <td>{pp2(r.r2)}</td>
                      <td>{r.n}</td>
                      <td style={{ textAlign: 'left', fontSize: 12 }}>{frBuckets(r.buckets)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </QueryState>
      <div className="card-foot">
        Élasticité : part d'une hausse de 1 % du driver transmise au prix de détail (pour les salaires, pp
        d'inflation des services par pp de salaires). « Avant 2023 » : renseigné pour les équations avec terme
        de régime. Cliquer un sous-indice pour ouvrir son équation.
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ explorateur d'équations
function EquationExplorer({
  sel,
  onSel,
}: {
  sel: { geo: string; item: string } | null;
  onSel: (s: { geo: string; item: string }) => void;
}) {
  const globalGeo = useApp((s) => s.geo);
  const mode = useThemeMode();
  const idx = useEquationIndex();
  const geo = sel?.geo ?? globalGeo;
  const item = sel?.item ?? (geo === STAGE1 ? 'ppi_energy' : 'CP0452');
  const q = useEquation(geo, item);
  const items = (idx.data?.data.equations ?? []).filter((e) => e.geo === geo).map((e) => e.item);

  return (
    <>
      <div className="card-head">
        <h2>Explorateur d'équations</h2>
        <div className="toolbar">
          <Segmented<string>
            ariaLabel="Pays de l'équation"
            value={geo}
            onChange={(g) =>
              onSel({ geo: g, item: g === STAGE1 ? 'ppi_energy' : item in STAGE1_ITEMS ? 'CP0452' : item })
            }
            options={[...GEOS.map((g) => ({ value: g, label: g })), { value: STAGE1, label: 'Étage 1 (EA)' }]}
          />
          <select
            aria-label="Sous-indice de l'équation"
            value={item}
            onChange={(e) => onSel({ geo, item: e.target.value })}
          >
            {items.map((i) => (
              <option key={i} value={i}>
                {itemLabel(i)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <QueryState q={q}>
        {(env) => {
          const eq = env.data;
          const tv = termsView(eq);
          const st = eq.stats;
          return (
            <>
              <p style={{ margin: '0 0 8px' }}>
                <b>{eq.name}</b> — {eq.item_label}
                {eq.regime_active && (
                  <span className="badge" style={{ marginLeft: 8 }}>
                    régime {eq.regime_start} actif
                  </span>
                )}
              </p>
              <pre className="formula" aria-label="Formule">
                {eq.formula}
              </pre>
              <div className="grid-2">
                <div className="scroll-x">
                  <table className="data" aria-label="Termes de l'équation">
                    <thead>
                      <tr>
                        <th>Terme</th>
                        <th style={{ textAlign: 'left' }}>Driver</th>
                        <th>Fenêtre</th>
                        <th>Coefficient</th>
                        <th>t</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tv.map((t) => (
                        <tr key={t.term}>
                          <td>{t.kind}</td>
                          <td style={{ textAlign: 'left' }}>{t.driver}</td>
                          <td>{t.window}</td>
                          <td>{fmtNum(t.coef, 3, true)}</td>
                          <td style={{ fontWeight: t.significant ? 600 : 400 }}>{fmtNum(t.t, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <table
                    className="data"
                    aria-label="Pass-through du régime actuel"
                    style={{ marginTop: 12 }}
                  >
                    <thead>
                      <tr>
                        <th>Pass-through cumulé</th>
                        <th>Actuel</th>
                        <th>Avant 2023</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentPassthrough(eq).map((p) => (
                        <tr key={p.driver}>
                          <td>{p.driver}</td>
                          <td>
                            <b>{pp2(p.sum)}</b>
                          </td>
                          <td>{pp2(p.old)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <Chart
                    ariaLabel={`Saisonnalité de ${eq.name}`}
                    height={220}
                    option={seasonOption(eq, mode)}
                  />
                  <table className="data" aria-label="Statistiques d'estimation">
                    <tbody>
                      <tr>
                        <td>Échantillon</td>
                        <td>{st.sample}</td>
                      </tr>
                      <tr>
                        <td>Observations (dont sous-pondérées)</td>
                        <td>
                          {st.n} ({st.downweighted})
                        </td>
                      </tr>
                      <tr>
                        <td>R²</td>
                        <td>{pp2(st.r2)}</td>
                      </tr>
                      <tr>
                        <td>Écart-type résiduel</td>
                        <td>{fmtNum(st.sigma, 2)} %/mois</td>
                      </tr>
                      <tr>
                        <td>Dérive de fond imposée</td>
                        <td>
                          {eq.drift === null
                            ? 'estimée (saisonnalité libre)'
                            : `${fmtNum(eq.drift, 2)} %/mois`}
                        </td>
                      </tr>
                      <tr>
                        <td>Demi-vie de pondération</td>
                        <td>{eq.half_life === null ? 'poids égaux' : `${eq.half_life} mois`}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="card-foot">
                Coefficients en %/mois pour 1 % de variation mensuelle du driver ; t en gras si |t| ≥ 2.
                Estimation : moindres carrés robustes (Huber) avec légère pénalité ridge (MODELES §3).
                Saisonnalité : effet du mois, dérive incluse. Source : /api/equations/{eq.geo}/{eq.item}.
              </div>
            </>
          );
        }}
      </QueryState>
    </>
  );
}
