/**
 * Chiffres témoins (plan §7) vérifiés À L'ÉCRAN : les vues sont rendues avec les vrais fichiers exportés par
 * backend/export_static.py (frontend/public/data). Prérequis : `python backend/export_static.py`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import type { ComponentRow } from '../api/types';
import { useApp } from '../store';
import { waterfallSteps } from './country/logic';
import { Country } from './Country';
import { Methodology } from './Methodology';
import { Overview } from './Overview';
import { Scenarios } from './Scenarios';

vi.mock('../charts/Chart', () => ({ Chart: () => null })); // pas de canvas dans jsdom

const DATA = resolve(__dirname, '../../public/data');
const HAS_DATA = existsSync(resolve(DATA, 'meta.json'));
const NB = String.fromCharCode(0x00a0);
const pct = (s: string) => `${s}${NB}%`;

/** URL d'API → fichier de l'export statique (même table que export_static.py). */
function fileFor(url: string): string {
  const u = new URL(url, 'http://x');
  const p = u.searchParams;
  const route = u.pathname.replace(/^\/api\//, '');
  if (route === 'history') return `history/${p.get('geo')}/${p.get('item')}.json`;
  if (['headline', 'components', 'scenarios', 'sensitivities'].includes(route))
    return `${route}/${p.get('geo')}.json`;
  return `${route}.json`;
}

function serveExport() {
  globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const body = JSON.parse(readFileSync(resolve(DATA, fileFor(url)), 'utf-8'));
    const from = new URL(url, 'http://x').searchParams.get('from');
    if (from && Array.isArray(body.data))
      body.data = body.data.filter((r: { period: string }) => r.period >= from);
    return new Response(JSON.stringify(body));
  }) as typeof fetch;
}

function show(el: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{el}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function row(table: HTMLElement, label: string) {
  return within(table)
    .getAllByRole('row')
    .find((r) => within(r).queryAllByRole('cell')[0]?.textContent?.startsWith(label))!;
}

describe.skipIf(!HAS_DATA)('chiffres témoins à l’écran (export statique réel)', () => {
  beforeEach(() => {
    serveExport();
    useApp.setState({ geo: 'EA', model: 'COMBINE', fixing: null });
  });

  it("Vue d'ensemble : COMBINE et marché", async () => {
    show(<Overview />);
    const table = await screen.findByRole('table', { name: 'Prévisions par fixing et par pays' });
    const cells = (label: string) =>
      within(row(table, label))
        .getAllByRole('cell')
        .map((c) => c.textContent);
    // colonnes : Fixing, EA, IT, FR, DE, ES, Marché EA, Écart EA
    expect(cells('Nov-26')[1]).toBe(pct('3,93'));
    expect(cells('Jan-27')[1]).toBe(pct('4,14'));
    expect(cells('Dec-27')[1]).toBe(pct('2,35'));
    expect(cells('Dec-26')[2]).toBe(pct('6,35'));
    expect(cells('Jun-27')[4]).toBe(pct('3,08'));
    expect(cells('Jan-27')[6]).toBe(pct('4,23'));
    expect(row(table, 'Oct-27').className).toBe('indicative');
    expect(row(table, 'Sep-27').className).toBe('');
  });

  it('Vue Pays : pont comptable EA Nov-26 = HICPxT BU', async () => {
    show(<Country />);
    const pont = await screen.findByRole('table', { name: 'Pont comptable Nov-26' });
    expect(within(row(pont, 'HICPxT (BU)')).getAllByRole('cell')[2]!.textContent).toBe(pct('3,91'));
    expect(within(row(pont, 'Résidu de chaînage')).getAllByRole('cell')[2]!.textContent).toBe(`+0,01${NB}pp`);
  });

  it('Scénarios EA : MODELES §12', async () => {
    show(<Scenarios />);
    const t = await screen.findByRole('table', { name: 'Scénarios : règles et résultats' });
    // colonnes : Scénario, gasoil ×3, HICPxT Dec-26 / Jun-27 / Dec-27
    const c = (k: string) =>
      within(row(t, k))
        .getAllByRole('cell')
        .map((x) => x.textContent);
    expect(c('central').slice(4)).toEqual([pct('4,06'), pct('3,72'), pct('2,31')]);
    expect(c('flat').slice(4)).toEqual([pct('4,06'), pct('3,97'), pct('2,82')]);
    expect(c('full').slice(4)).toEqual([pct('3,96'), pct('3,61'), pct('2,34')]);
    expect(c('central')[1]).toBe(`1${NB}240${NB}$/t`);
  });

  it('Méthodologie : rendu de MODELES.md avec sommaire', async () => {
    show(<Methodology />);
    expect(await screen.findByRole('link', { name: /14\. Limites/ })).toHaveAttribute(
      'href',
      '#14-limites-et-hypotheses-a-verifier-par-ordre-d-importance',
    );
    expect(screen.getByRole('heading', { level: 2, name: /^14\. Limites/ })).toHaveAttribute(
      'id',
      '14-limites-et-hypotheses-a-verifier-par-ordre-d-importance',
    );
  });
});

describe('pont comptable', () => {
  it('les marches cumulées aboutissent au total', () => {
    const rows: ComponentRow[] = [
      { fixing: '2026-11', item: 'TOT_X_TBC', yoy: 3.0, contrib_pp: null },
      { fixing: '2026-11', item: 'NRG', yoy: 10, contrib_pp: 0.9 },
      { fixing: '2026-11', item: 'FOOD_P_X_TBC', yoy: -1, contrib_pp: -0.1 },
      { fixing: '2026-11', item: 'FOOD_NP', yoy: 2, contrib_pp: 0.1 },
      { fixing: '2026-11', item: 'IGD_NNRG', yoy: 1, contrib_pp: 0.3 },
      { fixing: '2026-11', item: 'SERV', yoy: 4, contrib_pp: 1.9 },
      { fixing: '2026-11', item: 'CHAIN_RESIDUAL', yoy: null, contrib_pp: -0.1 },
    ];
    const s = waterfallSteps(rows, '2026-11');
    expect(s.map((x) => x.key)).toEqual([
      'NRG',
      'FOOD_P_X_TBC',
      'FOOD_NP',
      'IGD_NNRG',
      'SERV',
      'CHAIN_RESIDUAL',
      'TOTAL',
    ]);
    expect(s[5]!.end).toBeCloseTo(3.0);
    expect(s[6]!.value).toBe(3.0);
    expect(s[1]).toMatchObject({ start: 0.9, end: 0.8 });
  });
});
