import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Overview } from './views/Overview';

/** Les vues sont chargées à la demande (bundle initial allégé) ; la vue d'ensemble reste dans le bundle. */
function view<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K,
): LazyExoticComponent<ComponentType> {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}

const Country = view(() => import('./views/Country'), 'Country');
const Simulator = view(() => import('./views/Simulator'), 'Simulator');
const PassThrough = view(() => import('./views/PassThrough'), 'PassThrough');
const Scenarios = view(() => import('./views/Scenarios'), 'Scenarios');
const Backtest = view(() => import('./views/Backtest'), 'Backtest');
const Inputs = view(() => import('./views/Inputs'), 'Inputs');
const Methodology = view(() => import('./views/Methodology'), 'Methodology');

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="pays" element={<Country />} />
        <Route path="simulateur" element={<Simulator />} />
        <Route path="pass-through" element={<PassThrough />} />
        <Route path="scenarios" element={<Scenarios />} />
        <Route path="backtest" element={<Backtest />} />
        <Route path="inputs" element={<Inputs />} />
        <Route path="methodologie" element={<Methodology />} />
        <Route path="*" element={<div className="state">Page introuvable.</div>} />
      </Route>
    </Routes>
  );
}
