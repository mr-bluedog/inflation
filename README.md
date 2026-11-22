# Inflation HICPxT — moteur de prévision et dashboard

Prévision mois par mois de l'inflation HICPxT (hors tabac) pour la zone euro, l'Italie, la France, l'Allemagne et
l'Espagne, fixings **Nov-26 → Dec-27**, sous-indice par sous-indice, à partir des prix de gros de l'énergie, des
prix de production et des salaires. Le dashboard affiche les prévisions, leur décomposition, la transmission des
chocs, un simulateur, le backtest et les entrées.

| Dossier | Contenu |
|---|---|
| `euroinfl/` | **Moteur Python** (source de vérité) : `run_all.py` → `out/`. Spécification : `euroinfl/MODELES.md` |
| `backend/` | API FastAPI : lit `euroinfl/out/`, recalcul exact des chocs (`POST /api/simulate`) |
| `frontend/` | Dashboard React + TypeScript + Vite + ECharts (8 vues) |
| `data/raw/` | Base macro brute (97 séries, ne pas modifier) |
| `docs/` | Plan du dashboard, contrat de données, dictionnaire, site de référence |

## Démarrage local (Windows, PowerShell)

Prérequis : Python 3.11+, Node 20+.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
cd backend; ..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Dans un second terminal :

```powershell
cd frontend; npm install; npm run dev
```

Ouvrir http://localhost:5173 (l'API est relayée sur `/api` ; doc de l'API : http://localhost:8000/docs).

## Mettre à jour les prévisions

1. Modifier les entrées : `euroinfl/data/market_inputs.json` (courbes, EUR/USD, mois récents, hypothèses) et
   `euroinfl/data/market_fixings.json` (fixings de marché, comparaison uniquement).
2. Relancer le moteur, avec `PYTHONUTF8=1` pour que les JSON de sortie soient écrits en UTF-8 :

```powershell
$env:PYTHONUTF8 = "1"; cd euroinfl; ..\.venv\Scripts\python.exe run_all.py
```

3. Backtest (≈ 1 min) si les données historiques ont changé : `run_backtest.py` puis `summarize_backtest.py`,
   puis relancer `run_all.py` (les poids de combinaison en dépendent).
4. Redémarrer l'API, puis régénérer les données du mode statique :

```powershell
cd backend; ..\.venv\Scripts\python.exe export_static.py
```

5. Vérifier : `pytest` (backend) et `npm run test` (frontend) contrôlent les chiffres témoins du plan §7. S'ils
   échouent après une mise à jour volontaire des entrées, mettre à jour les valeurs attendues en connaissance de cause.

## Tests et qualité

```powershell
cd backend; ..\.venv\Scripts\python.exe -m pytest -q; ..\.venv\Scripts\python.exe -m ruff check .; ..\.venv\Scripts\python.exe -m black --check .
```

```powershell
cd frontend; npm run test; npm run lint; npm run build
```

## Déploiement

Deux modes, même frontend (variable `VITE_DATA_MODE`).

### Mode API : backend Railway + frontend Vercel

**Backend (Railway)**, depuis la racine du dépôt : `railway.json` construit `backend/Dockerfile` (contexte =
racine, car l'API importe `euroinfl/`) et surveille `/api/health`. Variables d'environnement :

| Variable | Exemple | Rôle |
|---|---|---|
| `FRONTEND_ORIGINS` | `https://inflation.vercel.app` | origines autorisées (CORS), séparées par des virgules |
| `FRONTEND_ORIGIN_REGEX` | `https://.*-monequipe\.vercel\.app` | facultatif : prévisualisations Vercel |
| `PORT` | fourni par Railway | port d'écoute |

Test local de l'image : `docker build -f backend/Dockerfile -t inflation-api .` puis
`docker run -p 8000:8000 inflation-api`.

**Frontend (Vercel)** : projet avec *Root Directory* = `frontend` (`frontend/vercel.json` : build Vite, réécriture
SPA, cache des fichiers). Variables : `VITE_DATA_MODE=api`, `VITE_API_BASE=https://<service>.up.railway.app`.

### Mode statique : Vercel seul

Mêmes réglages Vercel avec `VITE_DATA_MODE=static` (sans `VITE_API_BASE`). Le site lit
`frontend/public/data/` (versionné, produit par `export_static.py`). Le simulateur fonctionne alors en
approximation seule, et le bouton « Recalculer » est désactivé. Le build échoue si les données sont absentes.

## Règles du projet

Voir `CLAUDE.md` : le moteur est la source de vérité (le dashboard n'invente aucun chiffre), unités explicites
(%, bp, pp), glissements annuels en niveaux sur t−12, marché = comparaison uniquement.
