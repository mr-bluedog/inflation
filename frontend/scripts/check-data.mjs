// Garde-fou du build : en mode statique, les données exportées par backend/export_static.py doivent être présentes.
import { existsSync, readFileSync } from 'node:fs';

const mode = process.env.VITE_DATA_MODE === 'static' ? 'static' : 'api';
if (mode === 'static') {
  const manifest = new URL('../public/data/manifest.json', import.meta.url);
  if (!existsSync(manifest)) {
    console.error('Mode statique : public/data/manifest.json absent. Lancer `python backend/export_static.py`.');
    process.exit(1);
  }
  const m = JSON.parse(readFileSync(manifest, 'utf-8'));
  console.log(`Mode statique : ${m.n_files} fichiers, run ${m.run_id}, données au ${m.asof}.`);
} else if (!process.env.VITE_API_BASE) {
  console.log('Mode API : VITE_API_BASE vide, /api sur la même origine (proxy Vite en dev).');
} else {
  console.log(`Mode API : ${process.env.VITE_API_BASE}`);
}
