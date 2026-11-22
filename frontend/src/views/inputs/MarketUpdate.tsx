import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { adminCall, DATA_MODE, getAdminToken, setAdminToken } from '../../api/client';
import { useAdminStatus, useProposal } from '../../api/hooks';
import type { ApplyResult, MarketProposal } from '../../api/types';
import { fmtDateFr, fmtFixing, fmtNum } from '../../format';
import { changedRows, SECTION_LABEL } from './logic';

/** Jeton d'administration (exigé par le serveur quand ADMIN_TOKEN est défini). */
export function AdminToken({ required }: { required: boolean }) {
  const [v, setV] = useState(getAdminToken());
  if (!required) return null;
  return (
    <label className="check">
      Jeton d'administration
      <input
        type="password"
        className="search"
        autoComplete="off"
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          setAdminToken(e.target.value);
        }}
      />
    </label>
  );
}

export function MarketUpdate() {
  const qc = useQueryClient();
  const status = useAdminStatus();
  const pending = useProposal();
  const [busy, setBusy] = useState<'refresh' | 'apply' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  if (DATA_MODE === 'static')
    return (
      <section className="card">
        <h2>Mise à jour de la market data</h2>
        <p className="legend-note">Indisponible en mode statique : les données sont celles de l'export.</p>
      </section>
    );

  const p: MarketProposal | null = pending.data?.data ?? null;
  const canWrite = status.data?.write_enabled ?? false;

  const run = async (kind: 'refresh' | 'apply') => {
    setBusy(kind);
    setErr(null);
    setMsg(null);
    try {
      if (kind === 'refresh') {
        await adminCall<MarketProposal>('/api/inputs/market/refresh', 'POST');
        setMsg('Proposition prête : vérifier les écarts puis appliquer.');
      } else {
        const r = await adminCall<ApplyResult>('/api/inputs/market/apply', 'POST');
        setMsg(
          `Appliqué : inputs au ${fmtDateFr(r.data.asof)}, moteur relancé` +
            (r.data.archived ? `, ancien jeu archivé (${r.data.archived})` : '') +
            (r.data.static_exported ? ', export statique régénéré' : '') +
            '.',
        );
        await qc.invalidateQueries(); // toutes les vues se rechargent sur les nouvelles sorties
      }
      await qc.invalidateQueries({ queryKey: ['proposal'] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const groups = p ? changedRows(p.diff, all ? -1 : 0.05) : null;
  return (
    <section className="card">
      <div className="card-head">
        <h2>Mise à jour de la market data</h2>
        <div className="toolbar">
          <AdminToken required={status.data?.token_required ?? false} />
          <button className="btn" disabled={!canWrite || busy !== null} onClick={() => void run('refresh')}>
            {busy === 'refresh' ? 'Interrogation des sources…' : 'Rafraîchir depuis les sources publiques'}
          </button>
        </div>
      </div>
      {!canWrite && status.data && (
        <p className="legend-note">
          Écriture désactivée sur ce serveur (ADMIN_TOKEN non défini, accès non local).
        </p>
      )}
      <p className="legend-note">
        Sources : EUR/USD BCE ; TTF, Brent et ULSD (proxy du gasoil ICE) sur contrats NYMEX via Yahoo Finance
        ; électricité day-ahead <a href="https://energy-charts.info">Energy-Charts</a> (CC BY 4.0,
        Bundesnetzagentur / SMARD.de). Rien n'est appliqué sans validation. Les fixings d'inflation ne sont
        pas publics : saisie ci-dessous.
      </p>
      {msg && (
        <p className="legend-note" role="status">
          {msg}
        </p>
      )}
      {err && (
        <p className="state error" role="alert">
          {err}
        </p>
      )}
      {p && groups && (
        <>
          <div className="proposal-head">
            <b>Proposition du {fmtDateFr(p.created.slice(0, 10))}</b> · inputs au {fmtDateFr(p.inputs.asof)} ·
            EUR/USD {fmtNum(p.inputs.eurusd, 4)} · ratio du proxy gasoil {fmtNum(p.gasoil_ratio, 4)}
          </div>
          <ul className="warnings">
            {p.warnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
          <label className="check">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            Afficher aussi les lignes inchangées
          </label>
          {(Object.keys(groups) as (keyof typeof groups)[]).map((sec) =>
            groups[sec].length === 0 ? null : (
              <div key={sec} className="scroll-x">
                <table className="data" aria-label={`Écarts : ${SECTION_LABEL[sec]}`}>
                  <thead>
                    <tr>
                      <th>{SECTION_LABEL[sec]}</th>
                      <th>Période</th>
                      <th>Actuel</th>
                      <th>Proposé</th>
                      <th>Écart</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups[sec].map((r) => (
                      <tr key={`${r.key}/${r.period}`}>
                        <td>
                          {r.label} ({r.unit})
                        </td>
                        <td>{r.period ? fmtFixing(r.period) : '—'}</td>
                        <td>{fmtNum(r.current, r.key === 'eurusd' ? 4 : 2)}</td>
                        <td>
                          <b>{fmtNum(r.proposed, r.key === 'eurusd' ? 4 : 2)}</b>
                        </td>
                        <td>{r.change_pct === null ? 'nouveau' : `${fmtNum(r.change_pct, 1, true)} %`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ),
          )}
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button
              className="btn primary"
              disabled={!canWrite || busy !== null}
              onClick={() => void run('apply')}
            >
              {busy === 'apply' ? 'Moteur en cours (≈ 10 s)…' : 'Appliquer et relancer le moteur'}
            </button>
            <span className="legend-note">
              Remplace market_inputs.json (l'ancien est archivé) et relance run_all.py : toutes les prévisions
              changent.
            </span>
          </div>
        </>
      )}
    </section>
  );
}
