/**
 * Palette unique du dashboard (CLAUDE.md : une seule palette, définie ici).
 *
 * Palette catégorielle de référence (8 teintes, ordre fixe), validée par le script validate_palette.js
 * (skill dataviz) le 22/11/2026, en clair (#fcfcfb) comme en sombre (#1a1a19) : tous les contrôles passent.
 * En mode clair, aqua, jaune et magenta ont un contraste < 3:1 avec le fond : chaque graphique garde donc
 * une légende, une infobulle et une vue tableau (« relief rule »).
 *
 * Règles : la couleur suit l'entité (jamais le rang) ; les teintes s'attribuent dans l'ordre fixe, jamais
 * recyclées ; le texte reste dans les encres (primary/secondary/muted), jamais dans la couleur d'une série.
 */

export type Mode = 'light' | 'dark';

const CATEGORICAL: Record<Mode, readonly string[]> = {
  //       bleu       orange     aqua       jaune      magenta    vert       violet     rouge
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'],
};

export interface Ink {
  surface: string;
  plane: string;
  primary: string;
  secondary: string;
  muted: string;
  grid: string;
  axis: string;
  border: string;
  neutral: string;
}

export const INK: Record<Mode, Ink> = {
  light: {
    surface: '#fcfcfb',
    plane: '#f9f9f7',
    primary: '#0b0b0b',
    secondary: '#52514e',
    muted: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    border: 'rgba(11,11,11,0.10)',
    neutral: '#f0efec',
  },
  dark: {
    surface: '#1a1a19',
    plane: '#0d0d0d',
    primary: '#f0efec',
    secondary: '#c3c2b7',
    muted: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
    border: 'rgba(255,255,255,0.10)',
    neutral: '#383835',
  },
};

/** Indice de teinte catégorielle (0-7) par entité. Une même entité garde sa couleur dans toutes les vues. */
const SLOT = {
  // Modèles : la COMBINE (prévision centrale) prend la première teinte ; le marché et l'historique sont neutres.
  model: { COMBINE: 0, BU: 1, STAT: 2 },
  // Composantes HICPxT (barres empilées, pont comptable) : ordre fixe = ordre d'empilement.
  component: { NRG: 0, FOOD_P_X_TBC: 1, FOOD_NP: 2, IGD_NNRG: 3, SERV: 4 },
  // Sous-postes énergie.
  energy: { CP0722: 0, CP0453: 1, CP0452: 2, CP0451: 3 },
  geo: { EA: 0, IT: 1, FR: 2, DE: 3, ES: 4 },
  // Chocs : ttf_only partage la teinte de ttf_power (trait pointillé pour la distinguer).
  shock: {
    ttf_power: 0,
    ttf_only: 0,
    power_de: 1,
    power_fr: 2,
    gasoil: 3,
    eurusd: 4,
    food_commo: 5,
    nonfood_commo: 6,
    wages: 7,
  },
  scenario: { central: 0, flat: 1, full: 2, flat3_trend: 0, brent_crack: 3, brent_crack_full: 4 },
} as const;

export type Family = keyof typeof SLOT;

export function seriesColor(family: Family, key: string, mode: Mode): string {
  const idx = (SLOT[family] as Record<string, number>)[key];
  if (idx === undefined) return INK[mode].muted;
  return CATEGORICAL[mode][idx] ?? INK[mode].muted;
}

/** Couleurs neutres réservées : historique (gris), marché (encre secondaire, pointillé), résidu de chaînage. */
export function neutralColor(role: 'history' | 'market' | 'residual', mode: Mode): string {
  if (role === 'history') return INK[mode].muted;
  if (role === 'market') return INK[mode].secondary;
  return INK[mode].axis;
}

/** Pôles divergents bleu ↔ rouge, point milieu gris (heatmap de l'écart au marché). */
export const DIVERGING: Record<Mode, { neg: string; mid: string; pos: string }> = {
  light: { neg: '#2a78d6', mid: '#f0efec', pos: '#e34948' },
  dark: { neg: '#3987e5', mid: '#383835', pos: '#e66767' },
};

/** Spécifications de tracé (skill dataviz : traits fins, repères ≥ 8 px). */
export const MARKS = {
  lineWidth: 2,
  symbolSize: 8,
  barRadius: 4,
  gap: 2,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;
