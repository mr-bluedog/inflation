import { NavLink, Outlet } from 'react-router-dom';
import { DATA_MODE } from '../api/client';
import { useMeta } from '../api/hooks';
import { GEOS, MODELS, type Geo, type ModelKey } from '../api/types';
import { fmtDateFr, fmtMonthShortFr } from '../format';
import { useApp, type ThemePref } from '../store';
import { useThemeMode } from '../useThemeMode';
import { VIEWS } from '../views/registry';
import { Segmented } from './Segmented';

const THEMES: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

export function Layout() {
  useThemeMode();
  const meta = useMeta();
  const { geo, setGeo, model, setModel, theme, setTheme } = useApp();
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
        <button
          className="btn"
          disabled
          title={
            DATA_MODE === 'static'
              ? 'Indisponible en mode statique (pas de moteur)'
              : 'Recalcul exact par le moteur : disponible avec le simulateur (phase 5)'
          }
        >
          Recalculer
        </button>
        <Segmented<ThemePref>
          ariaLabel="Thème"
          value={theme}
          onChange={setTheme}
          options={THEMES.map((t) => ({ value: t.value, label: t.label }))}
        />
      </header>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
