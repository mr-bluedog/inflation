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

/** Drivers des équations (libellés courts d'interface ; unités dans /api/inputs/market). */
export const DRIVER_SHORT: Record<string, string> = {
  ttf: 'Gaz TTF',
  power_de: 'Électricité de gros DE',
  power_fr: 'Électricité de gros FR',
  gasoil_eur: 'Gasoil (€)',
  gasoil_usd_t: 'Gasoil ($)',
  ppi_energy: 'PPI énergie',
  ppi_food: 'PPI alimentaire',
  ppi_interm: 'PPI biens intermédiaires',
  wage_m: 'Salaires négociés',
  food_commo: 'Mat. prem. alimentaires',
  nonfood_commo: 'Mat. prem. industrielles',
};

/** Équations de l'étage 1 (prix de production zone euro). */
export const STAGE1_ITEMS: Record<string, string> = {
  ppi_energy: 'PPI énergie',
  ppi_food: 'PPI alimentaire',
  ppi_interm: 'PPI biens intermédiaires',
};

export const MONTHS_SHORT = [
  'jan',
  'fév',
  'mar',
  'avr',
  'mai',
  'juin',
  'juil',
  'aoû',
  'sep',
  'oct',
  'nov',
  'déc',
];

/** Libellés courts des chocs pré-calculés (légendes) ; le libellé complet vient de /api/meta. */
export const SHOCK_SHORT: Record<string, string> = {
  ttf_power: 'TTF (élec. entraînée)',
  ttf_only: 'TTF seul',
  power_de: 'Élec. de gros DE',
  power_fr: 'Élec. de gros FR',
  gasoil: 'Gasoil ($)',
  eurusd: 'Euro vs $',
  food_commo: 'Mat. prem. alim.',
  nonfood_commo: 'Mat. prem. ind.',
  wages: 'Salaires (+1 pp/an)',
};
