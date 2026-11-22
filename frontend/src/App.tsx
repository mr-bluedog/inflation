import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Country } from './views/Country';
import { Methodology } from './views/Methodology';
import { Overview } from './views/Overview';
import { Placeholder } from './views/Placeholder';
import { Scenarios } from './views/Scenarios';
import { VIEWS } from './views/registry';

/** Vues construites ; les autres affichent leur fiche (phase prévue, sources). */
const BUILT: Record<string, ReactElement> = {
  '/pays': <Country />,
  '/scenarios': <Scenarios />,
  '/methodologie': <Methodology />,
};

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        {VIEWS.slice(1).map((v) => (
          <Route key={v.path} path={v.path.slice(1)} element={BUILT[v.path] ?? <Placeholder view={v} />} />
        ))}
        <Route path="*" element={<div className="state">Page introuvable.</div>} />
      </Route>
    </Routes>
  );
}
