import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Geo, SensitivityRow } from '../../api/types';
import { isReferenceVintage } from '../../test-vintage';
import { key3, linearImpact, parseSearch, scaleFactor, SLIDERS, toSearch } from './logic';

const def = (k: string) => SLIDERS.find((d) => d.key === k)!;

describe('simulateur : échelle et URL', () => {
  it('facteur log pour les chocs multiplicatifs, linéaire pour les salaires', () => {
    expect(scaleFactor(def('ttf'), 10)).toBeCloseTo(1, 12);
    expect(scaleFactor(def('ttf'), 30)).toBeCloseTo(Math.log(1.3) / Math.log(1.1), 12);
    expect(scaleFactor(def('gasoil'), -10)).toBeCloseTo(Math.log(0.9) / Math.log(1.1), 12);
    expect(scaleFactor(def('wages_pp'), 0.5)).toBe(0.5);
  });

  it('aller-retour URL, bornes et valeurs par défaut', () => {
    const st = parseSearch(new URLSearchParams('ttf=30&gasoil=-15&wages_pp=9&link=0&sc=flat&oil=5'));
    expect(st).toEqual({ shocks: { ttf: 30, gasoil: -15, wages_pp: 5 }, linkPower: false, scenario: 'flat' });
    expect(toSearch(st).toString()).toBe('ttf=30&gasoil=-15&wages_pp=5&link=0&sc=flat');
    expect(parseSearch(new URLSearchParams(''))).toEqual({
      shocks: {},
      linkPower: true,
      scenario: 'central',
    });
  });

  it('choisit la sensibilité ttf_power ou ttf_only ; brent non approximable', () => {
    const rows = (shock: string, bp: number): SensitivityRow[] => [
      { shock, item: 'TOT_X_TBC', fixing: '2027-06', bp },
    ];
    const sens = { EA: [...rows('ttf_power', 6), ...rows('ttf_only', 3.6)] } as Record<Geo, SensitivityRow[]>;
    const k = key3('EA', 'TOT_X_TBC', '2027-06');
    expect(linearImpact(sens, { ttf: 10 }, true).bp.get(k)).toBeCloseTo(6);
    expect(linearImpact(sens, { ttf: 10 }, false).bp.get(k)).toBeCloseTo(3.6);
    expect(linearImpact(sens, { brent: 10 }, true).unsupported).toEqual(['brent']);
  });
});

const DATA = resolve(__dirname, '../../../public/data');

describe.skipIf(!isReferenceVintage(DATA))('approximation sur les sensibilités réelles', () => {
  const load = (g: string) =>
    JSON.parse(readFileSync(resolve(DATA, `sensitivities/${g}.json`), 'utf-8')).data as SensitivityRow[];
  const sens = Object.fromEntries(['EA', 'IT', 'FR', 'DE', 'ES'].map((g) => [g, load(g)])) as Record<
    Geo,
    SensitivityRow[]
  >;

  it('+10 % retrouve exactement les chiffres témoins', () => {
    const it = (s: Record<string, number>, g: string, f: string) =>
      linearImpact(sens, s, true).bp.get(key3(g, 'TOT_X_TBC', f))!;
    expect(it({ ttf: 10 }, 'IT', '2027-06')).toBeCloseTo(21.987, 3);
    expect(it({ gasoil: 10 }, 'EA', '2027-06')).toBeCloseTo(14.52, 3);
    expect(it({ wages_pp: 1 }, 'EA', '2027-12')).toBeCloseTo(16.191, 3);
  });

  it('TTF +30 % : approximation log (exact moteur IT Jun-27 = +61,6 bp, testé côté backend)', () => {
    const v = linearImpact(sens, { ttf: 30 }, true).bp.get(key3('IT', 'TOT_X_TBC', '2027-06'))!;
    expect(v).toBeCloseTo(60.5, 1);
  });
});
