import { Fragment, useState } from 'react';
import type { BacktestData, Geo } from '../../api/types';
import { GEOS } from '../../api/types';
import { Segmented } from '../../components/Segmented';
import { StatTile } from '../../components/StatTile';
import { ITEM_SHORT } from '../../labels';
import { divergingColor } from '../../theme';
import { useThemeMode } from '../../useThemeMode';
import { KEY_H, SCORE_ITEMS, scoreCell, scoreTone, type Period, type ScoreMetric } from './logic';

const H_LABEL: Record<number, string> = { 1: 'Nowcast (h1)', 3: '3 mois', 6: '6 mois', 12: '12 mois' };
const METRICS: { value: ScoreMetric; label: string }[] = [
  { value: 'skill', label: 'Score vs naïf' },
  { value: 'hit', label: 'Bon sens de variation' },
  { value: 'mae', label: 'Erreur moyenne (bp)' },
  { value: 'rmse', label: 'RMSE (bp)' },
];

function fmtMetric(metric: ScoreMetric, v: number | null): string {
  if (v === null) return '—';
  if (metric === 'rmse' || metric === 'mae') return `${Math.round(v * 100)} bp`; // pp → bp
  const pct = Math.round(v * 100);
  return metric === 'skill' ? `${pct > 0 ? '+' : ''}${pct} %` : `${pct} %`;
}

/** Score de prédiction par sous-composante : zone euro puis chaque pays, aux horizons 1, 3, 6 et 12 mois. */
export function ScoreBoard({
  bt,
  period,
  geoNames,
}: {
  bt: BacktestData;
  period: Period;
  geoNames: Record<string, string>;
}) {
  const mode = useThemeMode();
  const [metric, setMetric] = useState<ScoreMetric>('skill');
  const [model, setModel] = useState<'BU' | 'STAT'>('BU');
  const cell = (item: string, geo: Geo, h: number, m: ScoreMetric = metric, mdl = model) =>
    scoreCell(bt.scores, bt.rmse, item, geo, mdl, period, h, m);
  const periodLabel = period === 'all' ? 'origines 2019-01 → 2025-10' : 'origines depuis 2023-01';

  return (
    <>
      <div className="tiles">
        {KEY_H.map((h) => {
          const c = cell('TOT_X_TBC', 'EA', h, 'skill', 'BU');
          return (
            <StatTile
              key={h}
              label={`HICPxT zone euro — ${H_LABEL[h]} · BU`}
              value={<span className="num">{fmtMetric('skill', c.skill)}</span>}
              sub={
                <span className="num">
                  erreur moyenne {fmtMetric('mae', c.mae)} · RMSE {fmtMetric('rmse', c.rmse)} (naïf{' '}
                  {fmtMetric('rmse', c.rmseNaif)}) · bon sens {fmtMetric('hit', c.hit)}
                </span>
              }
            />
          );
        })}
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Score de prédiction par sous-composante — {periodLabel}</h2>
          <div className="toolbar">
            <Segmented<ScoreMetric>
              ariaLabel="Mesure du score"
              value={metric}
              onChange={setMetric}
              options={METRICS}
            />
            <Segmented<'BU' | 'STAT'>
              ariaLabel="Modèle du score"
              value={model}
              onChange={setModel}
              options={[
                { value: 'BU', label: 'BU' },
                { value: 'STAT', label: 'STAT' },
              ]}
            />
          </div>
        </div>
        <div className="scroll-x">
          <table className="data scores" aria-label="Score de prédiction par sous-composante">
            <thead>
              <tr>
                <th>Sous-composante</th>
                <th>Zone</th>
                {KEY_H.map((h) => (
                  <th key={h}>{H_LABEL[h]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SCORE_ITEMS.map((item) => (
                <Fragment key={item}>
                  {GEOS.map((g, gi) => (
                    <tr key={`${item}-${g}`} className={g === 'EA' ? 'group-start' : 'sub'}>
                      {gi === 0 && (
                        <td rowSpan={GEOS.length} style={{ textAlign: 'left', verticalAlign: 'top' }}>
                          <b>{ITEM_SHORT[item]}</b>
                        </td>
                      )}
                      <td style={{ textAlign: 'left' }}>
                        {g === 'EA' ? (
                          <b>{geoNames[g] ?? g}</b>
                        ) : (
                          <span className="indent">{geoNames[g] ?? g}</span>
                        )}
                      </td>
                      {KEY_H.map((h) => {
                        const c = cell(item, g, h);
                        const tone = scoreTone(metric, c.value);
                        return (
                          <td
                            key={h}
                            className="num"
                            style={tone === null ? undefined : { background: divergingColor(-tone, 1, mode) }}
                            title={`Score ${fmtMetric('skill', c.skill)} · erreur moyenne ${fmtMetric('mae', c.mae)} · RMSE ${fmtMetric('rmse', c.rmse)} contre ${fmtMetric('rmse', c.rmseNaif)} pour le naïf · bon sens ${fmtMetric('hit', c.hit)} · ${c.n} origines`}
                          >
                            {g === 'EA' ? <b>{fmtMetric(metric, c.value)}</b> : fmtMetric(metric, c.value)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-foot">
          <b>Score vs naïf</b> = 1 − RMSE du modèle / RMSE du naïf (glissement annuel de l'origine inchangé) :
          +100 % = parfait, 0 = pas mieux que le naïf, négatif = moins bien ·{' '}
          <span className="swatch" style={{ background: divergingColor(-1, 1, mode) }} /> meilleur ·{' '}
          <span className="swatch" style={{ background: divergingColor(1, 1, mode) }} /> moins bon.{' '}
          <b>Bon sens de variation</b> = part des origines où le modèle prévoit dans le bon sens l'évolution
          du glissement annuel depuis l'origine (50 % = hasard ; variations réalisées de moins de 0,05 pp
          exclues). <b>Erreur moyenne</b> = moyenne de |glissement annuel prévu − fixing réalisé|, en bp ;{' '}
          <b>RMSE</b> = racine de l'erreur quadratique moyenne, en bp (pénalise les grosses erreurs).{' '}
          <b>Nowcast (h1)</b> = fixing du premier mois non publié (ex. Nov-26 une fois octobre publié). Prix
          de gros figés à l'origine, prix à la pompe connus à la date de publication du HICP. Source :
          summarize_backtest.py ; survol d'une cellule = détail.
        </div>
      </section>
    </>
  );
}
