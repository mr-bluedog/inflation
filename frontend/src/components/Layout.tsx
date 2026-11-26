import { Suspense, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { adminCall, DATA_MODE } from '../api/client';
import { useMeta } from '../api/hooks';
import { GEOS, MODELS, type Geo, type ModelKey } from '../api/types';
import { fmtDateFr, fmtMonthShortFr } from '../format';
import { useApp, type ThemePref } from '../store';
import { useThemeMode } from '../useThemeMode';
import { SCENARIO_SHORT } from '../views/market/logic';
import { VIEWS } from '../views/registry';
import { Segmented } from './Segmented';

/** En ligne (Vercel) : la protection par mot de passe est active, on propose la déconnexion. */
const ONLINE =
  typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname);

const THEMES: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

export function Layout() {
  useThemeMode();
  const meta = useMeta();
  const { geo, setGeo, model, setModel, theme, setTheme, energyScenario, setEnergyScenario } = useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshErr, setRefreshErr] = useState<string | null>(null);
  /** Interroge les sources publiques et prépare une proposition (rien n'est appliqué) : elle s'affiche dans Inputs. */
  const refresh = async () => {
    setRefreshing(true);
    setRefreshErr(null);
    navigate('/inputs');
    try {
      await adminCall('/api/inputs/market/refresh', 'POST');
      await qc.invalidateQueries({ queryKey: ['proposal'] });
    } catch (e) {
      setRefreshErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  };
  const location = useLocation();
  const d = meta.data?.data;
  const geoNames = Object.fromEntries((d?.geos ?? []).map((g) => [g.code, g.name]));

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Navigation">
        <div className="brand">
          <img src="/favicon.svg" width={24} height={24} alt="" />
          <div>
            Inflation HICPxT
            <small>EA · IT · FR · DE · ES</small>
          </div>
        </div>
        <nav>
          <ul className="nav">
            {VIEWS.map((v, i) => (
              <li key={v.path}>
                <NavLink to={v.path} end={v.path === '/'}>
                  <span className="idx">{i + 1}</span>
                  {v.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-foot">
          Moteur euroinfl
          {meta.data && <> · run {meta.data.meta.run_id}</>}
          {ONLINE && (
            <div>
              <a href="/logout">Se déconnecter</a>
            </div>
          )}
        </div>
      </aside>

      <header className="header">
        <span className="dates" title="Dernier HICP publié · date des courbes de marché">
          {d ? (
            <>
              HICP {fmtMonthShortFr(d.dates.last_obs)} · courbes {fmtDateFr(d.dates.asof)}
            </>
          ) : meta.isError ? (
            <span className="state error">API injoignable</span>
          ) : (
            'Chargement…'
          )}
        </span>
        <span className={`badge ${DATA_MODE === 'static' ? 'static' : ''}`}>
          {DATA_MODE === 'static' ? 'Mode statique' : 'Mode API'}
        </span>
        <span className="spacer" />
        <span className="field">
          Pays
          <Segmented<Geo>
            ariaLabel="Pays"
            value={geo}
            onChange={setGeo}
            options={GEOS.map((g) => ({ value: g, label: g, title: geoNames[g] }))}
          />
        </span>
        <span className="field">
          Modèle
          <Segmented<ModelKey>
            ariaLabel="Modèle"
            value={model}
            onChange={setModel}
            options={MODELS.map((m) => ({ value: m, label: m }))}
          />
        </span>
        <label className="field">
          Scénario énergie
          <select
            aria-label="Scénario énergie"
            value={energyScenario}
            onChange={(e) => setEnergyScenario(e.target.value)}
            title="Règle de projection du gasoil (et donc du gazole et du fioul à la pompe) ; les autres inputs suivent leur courbe à terme"
          >
            {(d?.scenarios ?? []).map((s) => (
              <option key={s.key} value={s.key}>
                {SCENARIO_SHORT[s.key] ?? s.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn"
          disabled={DATA_MODE === 'static' || refreshing}
          title={
            DATA_MODE === 'static'
              ? 'Indisponible en mode statique (pas de serveur) : rafraîchir en local puis publier'
              : 'Interroge les sources publiques (BCE, NYMEX, Energy-Charts, Weekly Oil Bulletin) et prépare une proposition à valider'
          }
          onClick={() => void refresh()}
          aria-busy={refreshing}
        >
          {refreshing ? 'Interrogation des sources…' : 'Rafraîchir la market data'}
        </button>
        {refreshErr && (
          <span className="state error" role="alert" title={refreshErr}>
            Échec du rafraîchissement
          </span>
        )}
        <Segmented<ThemePref>
          ariaLabel="Thème"
          value={theme}
          onChange={setTheme}
          options={THEMES.map((t) => ({ value: t.value, label: t.label }))}
        />
      </header>

      <main className="main">
        {/* clé = chemin : l'erreur d'une vue ne survit pas à la navigation */}
        <ErrorBoundary key={location.pathname} label="La vue">
          <Suspense fallback={<div className="state">Chargement de la vue…</div>}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
