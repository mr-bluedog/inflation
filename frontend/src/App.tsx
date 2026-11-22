import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Overview } from './views/Overview';
import { Placeholder } from './views/Placeholder';
import { VIEWS } from './views/registry';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        {VIEWS.slice(1).map((v) => (
          <Route key={v.path} path={v.path.slice(1)} element={<Placeholder view={v} />} />
        ))}
        <Route path="*" element={<div className="state">Page introuvable.</div>} />
      </Route>
    </Routes>
  );
}
