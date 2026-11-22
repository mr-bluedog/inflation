import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { adminCall, DATA_MODE } from '../../api/client';
import { useAdminStatus, useFixings } from '../../api/hooks';
import type { FixingSeries, FixingsData } from '../../api/types';
import { QueryState } from '../../components/QueryState';
import { Segmented } from '../../components/Segmented';
import { fmtDateFr, fmtFixing } from '../../format';
import { AdminToken } from './MarketUpdate';

const todayIso = () => new Date().toISOString().slice(0, 10);

export function FixingsEditor() {
  const q = useFixings();
  const status = useAdminStatus();
  const [key, setKey] = useState('EA');
  const canWrite = DATA_MODE === 'api' && !!status.data?.write_enabled;
  return (
    <section className="card">
      <div className="card-head">
        <h2>Fixings de marché (saisie)</h2>
        <div className="toolbar">
          <AdminToken required={status.data?.token_required ?? false} />
          <Segmented<string>
            ariaLabel="Indice des fixings"
            value={key}
            onChange={setKey}
            options={[
              { value: 'EA', label: 'EA HICPxT' },
              { value: 'FR', label: 'FR IPC hors tabac' },
            ]}
          />
        </div>
      </div>
      <QueryState q={q}>
        {(env) => {
          const s = env.data.series.find((x) => x.key === key);
          return s ? (
            <Editor key={`${key}-${s.asof}`} series={s} canWrite={canWrite} />
          ) : (
            <div className="state">Indice non configuré.</div>
          );
        }}
      </QueryState>
    </section>
  );
}

const parse = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

function Editor({ series, canWrite }: { series: FixingSeries; canWrite: boolean }) {
  const qc = useQueryClient();
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      series.values.map((v) => [v.fixing, v.value === null ? '' : String(v.value).replace('.', ',')]),
    ),
  );
  const [asof, setAsof] = useState(todayIso());
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const invalid = Object.entries(vals).filter(([, s]) => {
    const v = parse(s);
    return v !== null && !Number.isFinite(v);
  });

  const save = async () => {
    setErr(null);
    setMsg(null);
    try {
      const values = Object.fromEntries(Object.entries(vals).map(([f, s]) => [f, parse(s)]));
      await adminCall<FixingsData>('/api/inputs/fixings', 'PUT', { key: series.key, asof, values });
      setMsg(`Fixings ${series.label} enregistrés (relevé du ${fmtDateFr(asof)}).`);
      await qc.invalidateQueries();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <p className="legend-note">
        <b>{series.label}</b>, glissement annuel en %. Dernier relevé :{' '}
        {series.asof ? fmtDateFr(series.asof) : '—'}.{' '}
        {series.comparable_geo
          ? `Comparé à la prévision ${series.comparable_geo} (écart en bp).`
          : "Indice différent de l'IHPC hors tabac prévu par le modèle : affiché pour information, sans écart calculé."}{' '}
        Comparaison uniquement, jamais utilisé par le modèle. Case vide = pas de cotation.
      </p>
      <div className="fixings-grid">
        {series.values.map((v) => (
          <label key={v.fixing} className="fixing-cell">
            <span>{fmtFixing(v.fixing)}</span>
            <input
              inputMode="decimal"
              aria-label={`Fixing ${fmtFixing(v.fixing)} (%)`}
              value={vals[v.fixing] ?? ''}
              disabled={!canWrite}
              onChange={(e) => setVals({ ...vals, [v.fixing]: e.target.value })}
            />
          </label>
        ))}
      </div>
      {canWrite ? (
        <div className="toolbar" style={{ marginTop: 10 }}>
          <label className="check">
            Date du relevé
            <input type="date" className="search" value={asof} onChange={(e) => setAsof(e.target.value)} />
          </label>
          <button className="btn primary" disabled={invalid.length > 0} onClick={() => void save()}>
            Enregistrer
          </button>
          {invalid.length > 0 && (
            <span className="state error">
              Valeur non numérique : {invalid.map(([f]) => fmtFixing(f)).join(', ')}
            </span>
          )}
        </div>
      ) : (
        <p className="legend-note">
          {DATA_MODE === 'static' ? 'Lecture seule en mode statique.' : 'Écriture désactivée sur ce serveur.'}
        </p>
      )}
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
    </>
  );
}
