import { describe, expect, it } from 'vitest';
import type { MarketPaths } from '../../api/types';
import { at, digits, firstProjection, marketChartOption, tableRows, values, visibleDrivers } from './logic';

const MP: MarketPaths = {
  asof: '2026-11-20',
  months: ['2026-10', '2026-11', '2026-12', '2027-01'],
  last_market_month: '2026-11',
  wob_last_week: '2026-11-16',
  scenarios: [
    { key: 'central', label: 'Central' },
    { key: 'flat', label: 'Front constant' },
  ],
  drivers: [
    {
      key: 'gasoil_usd_t',
      label: 'Gasoil ICE',
      unit: '$/t',
      group: 'petrole',
      geo: null,
      scenario_dependent: true,
      origin: ['proxy', 'proxy', 'projection', 'projection'],
      partial: [false, true, false, false],
    },
    {
      key: 'wob_e95_EA',
      label: 'Essence EA',
      unit: '€/1 000 l',
      group: 'pompe',
      geo: 'EA',
      scenario_dependent: false,
      origin: ['observe', 'observe', 'projection', 'projection'],
      partial: [false, true, false, false],
    },
    {
      key: 'wob_e95_IT',
      label: 'Essence IT',
      unit: '€/1 000 l',
      group: 'pompe',
      geo: 'IT',
      scenario_dependent: false,
      origin: ['observe', 'observe', 'projection', 'projection'],
      partial: [false, true, false, false],
    },
  ],
  paths: {
    central: {
      gasoil_usd_t: [1414, 1237, 1237, 1237],
      wob_e95_EA: [2061, 1952, 1893, 1869],
      wob_e95_IT: [1, 2, 3, 4],
    },
    flat: {
      gasoil_usd_t: [1414, 1237, 1237, 1237],
      wob_e95_EA: [2061, 1952, 1893, 1869],
      wob_e95_IT: [1, 2, 3, 4],
    },
  },
};
MP.paths.full = { gasoil_usd_t: [1414, 1237, 1136, 1118] };

describe('market data', () => {
  it('ne montre que les prix à la pompe du pays choisi', () => {
    expect(visibleDrivers(MP, 'EA').map((d) => d.key)).toEqual(['gasoil_usd_t', 'wob_e95_EA']);
  });

  it('lit la trajectoire du scénario, repli sur le central pour un input commun', () => {
    expect(values(MP, 'full', 'gasoil_usd_t')).toEqual([1414, 1237, 1136, 1118]);
    expect(values(MP, 'full', 'wob_e95_EA')).toEqual([2061, 1952, 1893, 1869]);
    expect(at(MP, 'central', 'gasoil_usd_t', '2027-01')).toBe(1237);
    expect(at(MP, 'central', 'gasoil_usd_t', '2030-01')).toBeNull();
  });

  it('sépare réalisé et projection, reliés au dernier point réalisé', () => {
    const d = MP.drivers[0]!;
    expect(firstProjection(d)).toBe(2);
    const o = marketChartOption(MP, d, 'central', 'light');
    const series = o.series as { name: string; data: (number | null)[] }[];
    const past = series.find((s) => s.name.includes('réalisé'))!;
    const proj = series.find((s) => s.name.includes('projection'))!;
    expect(past.data).toEqual([1414, 1237, null, null]);
    expect(proj.data).toEqual([null, 1237, 1237, 1237]);
    // gasoil : les autres scénarios sont tracés en gris (flat3_trend exclu, identique au central)
    expect(series.filter((s) => !s.name.includes('Gasoil'))).toHaveLength(1);
  });

  it('tableau : origine et mois partiel par cellule', () => {
    const t = tableRows(MP, 'central', 'EA', '2026-11');
    expect(t.months).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(t.rows[0]!.cells[0]).toEqual({ value: 1237, origin: 'proxy', partial: true });
    expect(t.rows[0]!.cells[1]!.origin).toBe('projection');
  });

  it('décimales selon l’unité', () => {
    expect(digits('$ pour 1 €')).toBe(3);
    expect(digits('$/t')).toBe(0);
    expect(digits('$/bbl')).toBe(1);
  });
});
