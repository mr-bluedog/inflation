// Garde-fou : frontend/vercel.json doit être un JSON valide (Vercel refuse sinon tout déploiement).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('vercel.json', () => {
  it('est un JSON valide avec réécriture SPA et mode statique par défaut', () => {
    const cfg = JSON.parse(readFileSync(resolve(__dirname, '../vercel.json'), 'utf-8'));
    expect(cfg.rewrites).toEqual([{ source: '/(.*)', destination: '/index.html' }]);
    expect(cfg.buildCommand).toContain('VITE_DATA_MODE=${VITE_DATA_MODE:-static}');
    expect(cfg.outputDirectory).toBe('dist');
  });
});
