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
| `docs/` | Plan du dashboard, contrat de données, dictionnaire des séries |

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

## Market data : rafraîchissement et fixings

**Inputs de marché** (prix de l'énergie, EUR/USD) : vue *Inputs* → « Rafraîchir depuis les sources publiques »,
ou `python backend/refresh_market.py`. Une **proposition** est construite puis affichée avec ses écarts ;
rien n'est appliqué sans validation (« Appliquer », ou `refresh_market.py --apply`) : l'ancien
`market_inputs.json` est archivé dans `euroinfl/data/vintages/`, le moteur est relancé et l'export statique
régénéré.

| Input | Source publique | Limite |
|---|---|---|
| EUR/USD | BCE (taux de référence) | officiel |
| TTF | NYMEX via Yahoo Finance (front) | courbe : forme précédente recalée sur le front |
| Brent | NYMEX via Yahoo Finance (front + contrats mensuels) | API non officielle |
| Gasoil | **proxy** : ULSD NYMEX × ratio ICE/ULSD (12 mois) | le gasoil ICE n'est pas public |
| Électricité DE, FR | Energy-Charts, day-ahead (CC BY 4.0, Bundesnetzagentur / SMARD.de) | spot ≠ contrat front ; courbe à terme conservée |

Le mois en cours est une moyenne partielle. Bloomberg remplacera ces sources (module
`backend/app/marketdata/`).

**Fixings de marché** (EA HICPxT, FR IPC hors tabac) : non publics, **saisis** dans la vue *Inputs*. Les
fixings France portent sur l'IPC hors tabac de l'Insee, pas sur l'IHPC prévu : ils sont affichés sans calcul
d'écart. Les fixings ne sont jamais utilisés par le modèle.

**Écritures protégées** : définir `ADMIN_TOKEN` sur le serveur (le dashboard demande alors le jeton). Sans
`ADMIN_TOKEN`, les écritures ne sont acceptées qu'en local. Sur Railway, le disque est éphémère : monter un
volume sur `euroinfl/` (ou recommiter les inputs) pour conserver les mises à jour.

Les tests de chiffres témoins valent pour le millésime d'inputs du 20/11/2026 : après une mise à jour appliquée,
ils sont ignorés (avec un message) au lieu d'échouer.

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
| `ADMIN_TOKEN` | longue chaîne aléatoire | autorise le rafraîchissement des inputs et la saisie des fixings |

Test local de l'image : `docker build -f backend/Dockerfile -t inflation-api .` puis
`docker run -p 8000:8000 inflation-api`.

**Frontend (Vercel)** : projet avec *Root Directory* = `frontend` (`frontend/vercel.json` : build Vite, réécriture
SPA, cache des fichiers). Variables : `VITE_DATA_MODE=api`, `VITE_API_BASE=https://<service>.up.railway.app`.

### Accès protégé par mot de passe

Le site en ligne est fermé par un **middleware Vercel** (`frontend/middleware.ts`, fichier autonome : Vercel
le compile sans ses imports locaux ; tests dans `frontend/src/edge/auth.test.ts`) : une page de connexion précède tout, pages **et** données. Variables Vercel (Settings →
Environment Variables, **sans** préfixe `VITE_`, donc jamais envoyées au navigateur) :

| Variable | Rôle |
|---|---|
| `SITE_PASSWORD` | mot de passe d'accès (obligatoire : sans lui, le site reste fermé) |
| `SITE_SESSION_DAYS` | durée de la session en jours (30 par défaut) |

Changer `SITE_PASSWORD` (puis redéployer) déconnecte tout le monde. Lien « Se déconnecter » en bas de la barre
latérale. En local (`npm run dev`), le middleware ne s'exécute pas.

### Mode statique : Vercel seul

Mêmes réglages Vercel, sans variable : `frontend/vercel.json` construit en **mode statique par défaut** (`VITE_DATA_MODE=api` pour le mode API). Le site lit
`frontend/public/data/` (versionné, produit par `export_static.py`). Le simulateur fonctionne alors en
approximation seule, et le bouton « Recalculer » est désactivé. Le build échoue si les données sont absentes.

## Règles du projet

Voir `CLAUDE.md` : le moteur est la source de vérité (le dashboard n'invente aucun chiffre), unités explicites
(%, bp, pp), glissements annuels en niveaux sur t−12, marché = comparaison uniquement.
