import {
  fmtBp,
  fmtDateFr,
  fmtFixing,
  fmtMonthFr,
  fmtMonthShortFr,
  fmtNum,
  fmtPct,
  fmtPp,
  fmtPrice,
} from './format';

const NB = String.fromCharCode(0x00a0);
const MINUS = String.fromCharCode(0x2212);

describe('format', () => {
  it('fmtPct', () => {
    expect(fmtPct(3.928142)).toBe(`3,93${NB}%`);
    expect(fmtPct(6.3489)).toBe(`6,35${NB}%`);
    expect(fmtPct(-0.0725, 2)).toBe(`${MINUS}0,07${NB}%`);
    expect(fmtPct(0.4, 1, true)).toBe(`+0,4${NB}%`);
    expect(fmtPct(null)).toBe('—');
    expect(fmtPct(Number.NaN)).toBe('—');
  });

  it('fmtBp toujours signé', () => {
    expect(fmtBp(25.754)).toBe(`+25,8${NB}bp`);
    expect(fmtBp(-9.1703)).toBe(`${MINUS}9,2${NB}bp`);
    expect(fmtBp(0)).toBe(`0,0${NB}bp`);
    expect(fmtBp(-0.04)).toBe(`0,0${NB}bp`); // pas de « −0,0 »
  });

  it('fmtPp', () => {
    expect(fmtPp(1.7228)).toBe(`+1,72${NB}pp`);
    expect(fmtPp(undefined)).toBe('—');
  });

  it('fmtNum groupe les milliers', () => {
    expect(fmtNum(1240, 0)).toBe(`1${NB}240`);
    expect(fmtPrice(1144.592, '$/t')).toBe(`1${NB}145${NB}$/t`);
  });

  it('fmtFixing au format de marché', () => {
    expect(fmtFixing('2026-11')).toBe('Nov-26');
    expect(fmtFixing('2027-01')).toBe('Jan-27');
    expect(fmtFixing('2027-12')).toBe('Dec-27');
    expect(() => fmtFixing('Nov-26')).toThrow();
  });

  it('dates en français', () => {
    expect(fmtMonthFr('2026-10')).toBe('oct. 2026');
    expect(fmtMonthShortFr('2026-10')).toBe('oct-26');
    expect(fmtDateFr('2026-11-20')).toBe('20/11/2026');
  });
});
