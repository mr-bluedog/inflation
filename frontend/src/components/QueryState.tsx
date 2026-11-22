import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';

/** États de chargement / erreur communs ; rend children(data) quand la donnée est là. */
export function QueryState<T>({ q, children }: { q: UseQueryResult<T>; children: (d: T) => ReactNode }) {
  if (q.isPending) return <div className="state">Chargement…</div>;
  if (q.isError)
    return (
      <div className="state error" role="alert">
        {q.error instanceof Error ? q.error.message : 'Erreur de chargement'}
      </div>
    );
  return <>{children(q.data)}</>;
}
