import { buildUrl, fetchEnvelope, requests } from './client';
import type { SensitivityRow } from './types';

describe('client : correspondance route → fichier statique (= export_static.py)', () => {
  it('construit les URL du mode api', () => {
    expect(buildUrl(requests.headline('EA'), 'api')).toBe('/api/headline?geo=EA');
    expect(buildUrl(requests.history('IT', 'SERV', '2019-01'), 'api')).toBe(
      '/api/history?geo=IT&item=SERV&from=2019-01',
    );
    expect(buildUrl(requests.sensitivities('EA'), 'api')).toBe('/api/sensitivities?geo=EA');
    expect(buildUrl(requests.equation('EA-stage1', 'ppi_energy'), 'api')).toBe(
      '/api/equations/EA-stage1/ppi_energy',
    );
  });

  it('construit les chemins du mode statique', () => {
    expect(buildUrl(requests.meta(), 'static')).toBe('/data/meta.json');
    expect(buildUrl(requests.history('DE', 'NRG'), 'static')).toBe('/data/history/DE/NRG.json');
    expect(buildUrl(requests.passthrough('IT', 'CP0452', 'ttf_power'), 'static')).toBe(
      '/data/passthrough/IT/CP0452.json',
    );
    expect(buildUrl(requests.backtestErrors('FR', 1), 'static')).toBe('/data/backtest/errors/FR.json');
    expect(buildUrl(requests.series('legacy_gas_1m'), 'static')).toBe(
      '/data/inputs/series/legacy_gas_1m.json',
    );
  });

  it('filtre côté client en mode statique', async () => {
    const rows: SensitivityRow[] = [
      { shock: 'gasoil', item: 'TOT_X_TBC', fixing: '2027-06', bp: 18 },
      { shock: 'gasoil', item: 'NRG', fixing: '2027-06', bp: 190 },
      { shock: 'wages', item: 'TOT_X_TBC', fixing: '2027-06', bp: 9.8 },
    ];
    const meta = { asof: '2026-11-20', last_obs: '2026-10', run_id: 'x', units: {}, model: 'BU', notes: [] };
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ meta, data: rows }))) as typeof fetch;
    const env = await fetchEnvelope<SensitivityRow[]>(
      requests.sensitivities('EA', 'gasoil', 'TOT_X_TBC'),
      undefined,
      'static',
    );
    expect(env.data).toEqual([rows[0]]);
  });

  it("remonte le détail d'erreur du backend", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ detail: 'équation inconnue : XX/YY' }), { status: 404 }),
    ) as typeof fetch;
    await expect(fetchEnvelope(requests.equation('XX', 'YY'), undefined, 'api')).rejects.toThrow(
      'équation inconnue : XX/YY',
    );
  });
});
