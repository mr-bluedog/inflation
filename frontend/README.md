# Frontend — dashboard HICPxT (React + TypeScript + Vite + ECharts)

```powershell
cd frontend
npm install
npm run dev        # http://localhost:5173 ; /api relayé vers le backend (port 8000)
npm run test       # vitest
npm run lint       # eslint
npm run build      # tsc + vite build -> dist/
```

Mode statique (sans backend) : `python backend/export_static.py`, puis `VITE_DATA_MODE=static` au build (voir `.env.example`). Les fichiers sont servis depuis `public/data/`.

| Dossier / fichier | Rôle |
|---|---|
| `src/theme.ts` | **palette unique** (catégorielle validée, encres, divergente) et couleur fixe par entité |
| `src/format.ts` | `fmtPct`, `fmtBp`, `fmtPp`, `fmtFixing` (`Nov-26`), dates en français |
| `src/api/` | types (d'après `backend/app/schemas.py`), client api/statique, hooks TanStack Query |
| `src/store.ts` | état global Zustand (pays, modèle, fixing, thème) |
| `src/charts/` | enveloppe ECharts (import modulaire) et options communes |
| `src/components/` | mise en page, sélecteurs, états de chargement |
| `src/views/` | les 8 vues du plan §2 |
