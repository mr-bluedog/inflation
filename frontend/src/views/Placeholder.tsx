import type { ReactNode } from 'react';
import type { ViewDef } from './registry';

/** Vue pas encore construite : dit ce qu'elle contiendra, quand, et d'où viendront les chiffres. */
export function Placeholder({ view, children }: { view: ViewDef; children?: ReactNode }) {
  return (
    <div className="page">
      <div className="page-head">
        <h1>{view.label}</h1>
        <p>{view.description}</p>
      </div>
      <div className="placeholder">
        Vue construite en phase {view.phase}. Sources :
        <ul>
          {view.sources.map((s) => (
            <li key={s}>
              <code>{s}</code>
            </li>
          ))}
        </ul>
      </div>
      {children}
    </div>
  );
}
