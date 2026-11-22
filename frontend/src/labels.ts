/** Libellés courts de l'interface (les libellés longs viennent de /api/meta). Aucun chiffre ici. */
import type { Item } from './api/types';

export const ITEM_SHORT: Record<Item | 'CHAIN_RESIDUAL', string> = {
  TOT_X_TBC: 'HICPxT',
  NRG: 'Énergie',
  CP0722: 'Carburants',
  CP0453: 'Fioul',
  CP0452: 'Gaz',
  CP0451: 'Électricité',
  FOOD_P_X_TBC: 'Alim. transformée',
  FOOD_NP: 'Alim. non transformée',
  IGD_NNRG: 'Biens (NEIG)',
  SERV: 'Services',
  CHAIN_RESIDUAL: 'Résidu de chaînage',
};

/** Composantes de l'HICPxT dans l'ordre d'empilement (= ordre des couleurs de theme.ts). */
export const TOP_ITEMS: Item[] = ['NRG', 'FOOD_P_X_TBC', 'FOOD_NP', 'IGD_NNRG', 'SERV'];
export const ENERGY_ITEMS: Item[] = ['CP0722', 'CP0453', 'CP0452', 'CP0451'];

export const MODEL_LABEL: Record<string, string> = {
  COMBINE: 'Combinaison BU/STAT',
  BU: 'Bottom-up (BU)',
  STAT: 'Statistique (STAT)',
  NAIF: 'Naïf',
  BU_perfect: 'BU prix parfaits',
};

/** Mois consécutifs inclusifs 'YYYY-MM'. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
