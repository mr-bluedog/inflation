import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMeta, useMethodology } from '../api/hooks';
import { QueryState } from '../components/QueryState';
import { fmtDateFr, fmtMonthFr } from '../format';
import { headings, slug, textOf } from './methodology/logic';

export function Methodology() {
  const meta = useMeta();
  const q = useMethodology();
  const d = meta.data?.data.dates;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Méthodologie</h1>
        <p>
          Spécification du modèle, telle que livrée avec le moteur (<code>euroinfl/MODELES.md</code>).
        </p>
      </div>
      {d && (
        <div className="tiles">
          <div className="tile">
            <div className="tile-label">Dernier HICP publié</div>
            <div className="tile-value">{fmtMonthFr(d.last_obs)}</div>
            <div className="tile-sub">Eurostat, vintage du {fmtDateFr(d.hicp_vintage)}</div>
          </div>
          <div className="tile">
            <div className="tile-label">Courbes de marché</div>
            <div className="tile-value">{fmtDateFr(d.asof)}</div>
            <div className="tile-sub">market_inputs.json (mois août-nov. 2026 estimés)</div>
          </div>
          <div className="tile">
            <div className="tile-label">Fixings marché (comparaison)</div>
            <div className="tile-value">{fmtDateFr(d.market_fixings_asof)}</div>
            <div className="tile-sub">Zone euro uniquement</div>
          </div>
        </div>
      )}
      <QueryState q={q}>
        {(env) => (
          <>
            <nav className="card" aria-label="Sommaire">
              <h2>Sommaire</h2>
              <ol className="toc">
                {headings(env.data.markdown).map((h) => (
                  <li key={h.id} style={{ listStyle: 'none' }}>
                    <a
                      href={`#${h.id}`}
                      onClick={(e) => {
                        // le défilement se fait dans <main>, pas dans la fenêtre : on cible la section
                        e.preventDefault();
                        document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    >
                      {h.text}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <article className="card markdown">
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h2: ({ children }) => <h2 id={slug(textOf(children))}>{children}</h2>,
                }}
              >
                {env.data.markdown}
              </Markdown>
              <div className="card-foot">Source : {env.data.source}</div>
            </article>
          </>
        )}
      </QueryState>
    </div>
  );
}
