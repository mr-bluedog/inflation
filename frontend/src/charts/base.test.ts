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
