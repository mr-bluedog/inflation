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
import { PassThrough } from './PassThrough';
import { parseBuckets } from './passthrough/logic';
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
  if (route === 'history' || route === 'passthrough') return `${route}/${p.get('geo')}/${p.get('item')}.json`;
  if (['headline', 'components', 'scenarios', 'sensitivities'].includes(route))
    return `${route}/${p.get('geo')}.json`;
  if (route === 'equations') return 'equations/index.json';
  return `${route}.json`; // equations/IT/CP0452, elasticities, meta…
}

function serveExport() {
  globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const body = JSON.parse(readFileSync(resolve(DATA, fileFor(url)), 'utf-8'));
    const q = new URL(url, 'http://x').searchParams;
    const from = q.get('from');
    const shock = q.get('shock');
    if (from && Array.isArray(body.data))
      body.data = body.data.filter((r: { period: string }) => r.period >= from);
    if (shock && Array.isArray(body.data))
      body.data = body.data.filter((r: { shock: string }) => r.shock === shock);
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

describe.skipIf(!HAS_DATA)('pass-through : MODELES §11 à l’écran (export réel)', () => {
  beforeEach(() => {
    serveExport();
    useApp.setState({ geo: 'EA', model: 'COMBINE', fixing: null });
  });

  it('zoom Italie gaz : niveaux à 2 / 5 / 11 mois', async () => {
    show(<PassThrough />);
    const t = await screen.findByRole('table', { name: 'Zoom Italie gaz : variation du niveau des indices' });
    const c = (label: string) =>
      within(row(t, label))
        .getAllByRole('cell')
        .slice(1)
        .map((x) => x.textContent);
    const s = (v: string) => `+${v}${NB}%`;
    // MODELES §11 (1 décimale) : gaz 2,4 / 3,5 / 4,4 ; élec 1,5 / 2,7 / 3,9 ; énergie 1,2 / 1,8 / 2,4 ; HICPxT 0,15 / 0,22 / 0,31
    expect(c('Gaz IT')).toEqual([s('2,39'), s('3,48'), s('4,44')]);
    expect(c('Électricité IT')).toEqual([s('1,53'), s('2,74'), s('3,91')]);
    expect(c('Énergie IT')).toEqual([s('1,15'), s('1,76'), s('2,40')]); // 1,1467 : MODELES écrit 1,2
    expect(c('HICPxT Italie')).toEqual([s('0,15'), s('0,22'), s('0,31')]);
    expect(c('HICPxT Zone euro')).toEqual([s('0,03'), s('0,05'), s('0,08')]);
    // étapes : élasticités gaz 0,49 (avant 2023 0,15) et électricité 0,42
    expect(screen.getByText(/TTF → gaz de détail/).parentElement?.textContent).toContain(
      'total 0,49 (avant 2023 : 0,15)',
    );
    expect(screen.getByText(/électricité de détail/).parentElement?.textContent).toContain('élasticité 0,42');
  });

  it("explorateur d'équations : gaz italien", async () => {
    useApp.setState({ geo: 'IT' });
    show(<PassThrough />);
    const t = await screen.findByRole('table', { name: "Termes de l'équation" });
    const gamma = within(t)
      .getAllByRole('row')
      .find((r) => r.textContent?.includes('t−0 … t−1') && r.textContent.includes('γ'))!;
    expect(
      within(gamma)
        .getAllByRole('cell')
        .map((x) => x.textContent)
        .slice(3),
    ).toEqual(['+0,252', '6,4']);
    const pt = screen.getByRole('table', { name: 'Pass-through du régime actuel' });
    expect(
      within(pt)
        .getAllByRole('cell')
        .map((x) => x.textContent),
    ).toEqual(['Gaz TTF', '0,49', '0,15']);
  });
});

describe('parseBuckets', () => {
  it('lit les fenêtres du moteur', () => {
    expect(parseBuckets('ttf[0-1]=0.252; ttf[2-4]=0.118; power_de[12-23]=-0.000')).toEqual([
      { driver: 'ttf', lo: 0, hi: 1, value: 0.252 },
      { driver: 'ttf', lo: 2, hi: 4, value: 0.118 },
      { driver: 'power_de', lo: 12, hi: 23, value: -0 },
    ]);
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
