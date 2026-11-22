import type { ReactNode } from 'react';

// diacritiques combinants U+0300–U+036F (construits par code pour rester lisibles dans le source)
const COMBINING = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');

/** Ancre stable à partir d'un titre (« 13. Limites et… » → « 13-limites-et… »). */
export function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return '';
}

/** Titres de niveau 2 du markdown (sommaire). */
export function headings(md: string): { text: string; id: string }[] {
  return md
    .split('\n')
    .filter((l) => l.startsWith('## '))
    .map((l) => {
      const text = l.slice(3).trim();
      return { text, id: slug(text) };
    });
}
