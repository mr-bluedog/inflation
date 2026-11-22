import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { useApp } from './store';

const meta = {
  asof: '2026-11-20',
  last_obs: '2026-10',
  run_id: 'abc123def456',
  units: {},
  model: null,
  notes: [],
};
const metaData = {
  geos: [
    { code: 'EA', name: 'Zone euro' },
    { code: 'IT', name: 'Italie' },
  ],
  dates: {
    asof: '2026-11-20',
    last_obs: '2026-10',
    hicp_vintage: '2026-11-18',
    market_fixings_asof: '2026-11-20',
  },
};

function mockFetch() {
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/api/meta')) return new Response(JSON.stringify({ meta, data: metaData }));
    return new Response(JSON.stringify({ meta, data: [] }));
  }) as typeof fetch;
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  // jsdom : ECharts a besoin de matchMedia et ResizeObserver
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe('layout', () => {
  beforeEach(mockFetch);

  it('affiche les 8 vues et la date des données', async () => {
    renderAt('/backtest');
    const nav = screen.getByRole('navigation');
    expect(within(nav).getAllByRole('link')).toHaveLength(8);
    expect(await screen.findByText('HICP oct-26 · courbes 20/11/2026')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Backtest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recalculer' })).toBeEnabled(); // mode API
  });

  it('le sélecteur de pays met à jour le store', async () => {
    renderAt('/scenarios');
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Pays' })).getByRole('button', { name: 'IT' }),
    );
    expect(useApp.getState().geo).toBe('IT');
    expect(
      within(screen.getByRole('group', { name: 'Pays' })).getByRole('button', { name: 'IT' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
