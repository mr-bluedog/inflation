/**
 * Formatage des nombres et des dates (CLAUDE.md règle 3 : unités explicites partout).
 * Séparateur décimal français (virgule), espace insécable avant l'unité, vrai signe moins (−).
 */

const NBSP = ' ';
const MINUS = '−';
const DASH = '—';
const MONTHS_FIXING = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FR = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];
const MONTHS_FR_SHORT = [
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

type Num = number | null | undefined;

function isNum(v: Num): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Nombre au format français, sans unité. signed = affiche « + » pour les positifs. */
export function fmtNum(v: Num, digits = 2, signed = false): string {
  if (!isNum(v)) return DASH;
  const r = Number(v.toFixed(digits));
  const abs = Math.abs(r).toFixed(digits).replace('.', ',');
  const [int, dec] = abs.split(',');
  const intGrouped = (int ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const body = dec !== undefined ? `${intGrouped},${dec}` : intGrouped;
  if (r < 0) return `${MINUS}${body}`;
  if (signed && r > 0) return `+${body}`;
  return body;
}

/** Glissement annuel ou niveau en % : « 3,93 % ». */
export function fmtPct(v: Num, digits = 2, signed = false): string {
  return isNum(v) ? `${fmtNum(v, digits, signed)}${NBSP}%` : DASH;
}

/** Impact en points de base, toujours signé : « +25,8 bp ». */
export function fmtBp(v: Num, digits = 1): string {
  return isNum(v) ? `${fmtNum(v, digits, true)}${NBSP}bp` : DASH;
}

/** Contribution en points de pourcentage, signée : « +1,72 pp ». */
export function fmtPp(v: Num, digits = 2): string {
  return isNum(v) ? `${fmtNum(v, digits, true)}${NBSP}pp` : DASH;
}

/** Prix avec unité : « 1 240 $/t », « 88,0 €/MWh ». */
export function fmtPrice(v: Num, unit: string, digits = 0): string {
  return isNum(v) ? `${fmtNum(v, digits)}${NBSP}${unit}` : DASH;
}

function parsePeriod(period: string): [number, number] {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`période invalide : ${period}`);
  return [Number(m[1]), Number(m[2])];
}

/** Fixing au format de marché : '2026-11' → 'Nov-26'. */
export function fmtFixing(period: string): string {
  const [y, m] = parsePeriod(period);
  return `${MONTHS_FIXING[m - 1]}-${String(y).slice(2)}`;
}

/** Mois en français : '2026-10' → 'oct. 2026'. */
export function fmtMonthFr(period: string): string {
  const [y, m] = parsePeriod(period);
  return `${MONTHS_FR[m - 1]} ${y}`;
}

/** Mois court en français : '2026-10' → 'oct-26' (en-tête « HICP oct-26 »). */
export function fmtMonthShortFr(period: string): string {
  const [y, m] = parsePeriod(period);
  return `${MONTHS_FR_SHORT[m - 1]}-${String(y).slice(2)}`;
}

/** Date ISO → '20/11/2026'. */
export function fmtDateFr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
