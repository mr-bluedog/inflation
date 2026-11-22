// Tests uniquement. Les chiffres témoins valent pour le millésime d'inputs de référence (20/11/2026). Le critère
// est le CONTENU des inputs exportés (pas la date : un rafraîchissement le même jour garde la date avec d'autres
// prix). Hors millésime de référence, les tests de chiffres témoins sont ignorés.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REF_INPUTS = resolve(__dirname, '../../backend/tests/fixtures/market_inputs_20261120.json');

export function isReferenceVintage(dataDir: string): boolean {
  try {
    if (!existsSync(resolve(dataDir, 'meta.json'))) return false;
    const exported = JSON.parse(readFileSync(resolve(dataDir, 'inputs/market.json'), 'utf-8')).data;
    const ref = JSON.parse(readFileSync(REF_INPUTS, 'utf-8'));
    const refRecent = Object.entries(ref.recent_months as Record<string, Record<string, number>>)
      .filter(([k]) => !k.startsWith('_'))
      .map(([month, values]) => [month, values]);
    const got = (exported.recent_months as { month: string; values: unknown }[]).map((r) => [
      r.month,
      r.values,
    ]);
    return exported.eurusd === ref.eurusd && JSON.stringify(got) === JSON.stringify(refRecent);
  } catch {
    return false;
  }
}
