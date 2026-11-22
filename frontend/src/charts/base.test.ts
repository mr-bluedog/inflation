import { baseOption, mergeOption } from './base';

describe('mergeOption', () => {
  it('garde le style de base du tooltip quand la vue le précise', () => {
    const m = mergeOption(baseOption('dark'), { tooltip: { trigger: 'item' }, series: [] });
    const t = m.tooltip as Record<string, unknown>;
    expect(t.trigger).toBe('item');
    expect(t.confine).toBe(true);
    expect(t.backgroundColor).toBe('#1a1a19');
  });
  it('respecte legend.show = false', () => {
    const m = mergeOption(baseOption('light'), { legend: { show: false } });
    expect((m.legend as Record<string, unknown>).show).toBe(false);
    expect((m.legend as Record<string, unknown>).icon).toBe('roundRect');
  });
});

describe('csvFromOption', () => {
  it('exporte les valeurs tracées, virgule décimale, séparateur ;', async () => {
    const { csvFromOption } = await import('./base');
    const csv = csvFromOption({
      xAxis: { type: 'category', data: ['Nov-26', 'Dec-26'] },
      series: [
        { name: 'BU', type: 'line', data: [3.905734, null] },
        { name: 'Marché; EA', type: 'line', data: [{ value: 3.76 }, 3.88] },
        { type: 'bar', data: [1, 2] }, // série sans nom (base transparente) : ignorée
      ],
    });
    expect(csv).toBe(';BU;"Marché; EA"\r\nNov-26;3,905734;3,76\r\nDec-26;;3,88');
  });
  it('null sans axe de catégories', async () => {
    const { csvFromOption } = await import('./base');
    expect(csvFromOption({ series: [] })).toBeNull();
  });
});
