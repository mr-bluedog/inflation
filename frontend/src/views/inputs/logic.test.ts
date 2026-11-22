import type { DiffRow, FixingsData } from '../../api/types';
import { otherMarketFor } from '../overview/logic';
import { changedRows } from './logic';

const row = (p: Partial<DiffRow>): DiffRow => ({
  section: 'recent',
  key: 'ttf',
  label: 'Gaz TTF',
  unit: '€/MWh',
  period: '2026-11',
  current: 88,
  proposed: 88,
  change_pct: 0,
  ...p,
});

describe('changedRows', () => {
  it('garde les écarts réels et les valeurs ajoutées, groupés par section', () => {
    const g = changedRows([
      row({}),
      row({ proposed: 90, change_pct: 2.27 }),
      row({ section: 'curve', period: '2028-01', current: null, proposed: 60, change_pct: null }),
      row({
        section: 'scalar',
        key: 'eurusd',
        period: null,
        current: 1.099,
        proposed: 1.0991,
        change_pct: 0.009,
      }),
    ]);
    expect(g.recent).toHaveLength(1);
    expect(g.curve).toHaveLength(1);
    expect(g.scalar).toHaveLength(0); // 0,009 % < seuil
  });
});

describe('otherMarketFor', () => {
  const fx: FixingsData = {
    source: 's',
    series: [
      {
        key: 'EA',
        label: 'HICPxT',
        comparable_geo: 'EA',
        asof: null,
        values: [{ fixing: '2026-11', value: 3.76 }],
      },
      {
        key: 'FR',
        label: 'IPC France hors tabac (Insee)',
        comparable_geo: null,
        asof: '2026-11-21',
        values: [
          { fixing: '2026-11', value: 1.9 },
          { fixing: '2026-12', value: null },
        ],
      },
    ],
  };
  it("renvoie la série FR (indice différent) et ignore l'EA comparable", () => {
    const o = otherMarketFor(fx, 'FR')!;
    expect(o.label).toBe('IPC France hors tabac (Insee)');
    expect([...o.values]).toEqual([['2026-11', 1.9]]);
    expect(otherMarketFor(fx, 'EA')).toBeNull();
    expect(otherMarketFor(fx, 'IT')).toBeNull();
  });
});

describe('origine des mois après la base', () => {
  it('résume par origine en retenant la moins fiable de chaque driver', async () => {
    const { qualitySummary, areaLabel, statusLabel } = await import('./logic');
    const rows = [
      { quality: { eurusd: 'observe', gasoil_usd_t: 'proxy', ttf: 'observe' } as const },
      { quality: { eurusd: 'observe', gasoil_usd_t: 'proxy', ttf: 'estime' } as const },
    ];
    expect(qualitySummary(rows, { eurusd: 'EUR/USD', gasoil_usd_t: 'gasoil', ttf: 'TTF' })).toEqual({
      observe: ['EUR/USD'],
      proxy: ['gasoil'],
      estime: ['TTF'],
    });
    expect(
      areaLabel([
        { month: '2026-10', quality: 'observe', partial: false },
        { month: '2026-11', quality: 'observe', partial: true },
      ]),
    ).toBe('observé');
    expect(statusLabel({ quality: 'proxy', partial: true })).toBe('proxy · partiel');
  });
});
