# CLAUDE.md — Projet Inflation (HICPxT zone euro + IT/FR/DE/ES)

Ce fichier est lu automatiquement par Claude Code à chaque session. Il décrit le projet, les règles et les commandes.

## Langue
- Échanges, commentaires de code, libellés UI et docs : **français**.
- Noms de variables, fonctions, routes API, clés JSON : **anglais** (cohérent avec le moteur existant).

## Le projet en deux phrases
Un moteur Python (`euroinfl/`) prévoit l'inflation HICPxT (hors tabac) mois par mois, sous-indice par sous-indice, à partir des prix de gros de l'énergie, des prix de production et des salaires, pour EA, IT, FR, DE, ES, fixings **Nov-26 → Dec-27**.
On construit un **dashboard web** qui affiche ces prévisions, leur décomposition, les sensibilités aux chocs, le pass-through, les scénarios gasoil, le backtest et les inputs, inspiré du site de référence euro-inflation.vercel.app.

## Documents de référence (à lire avant de coder)
| Fichier | Rôle |
|---|---|
| `euroinfl/MODELES.md` | **Spécification du modèle** : équations, élasticités, backtest, sensibilités, limites. Source de vérité des chiffres attendus. |
| `docs/PLAN_DASHBOARD.md` | **Plan du dashboard** : vues, architecture, contrat d'API, phases, critères d'acceptation. |
| `docs/euro-inflation-spec.md` | Description du site de référence (vues, API, conventions). Inspiration UX, ne pas copier ses chiffres. |
| `docs/DATA_DICTIONARY.md` | Les 97 séries de la base CSV (codes, unités, dates de début/fin). |

## Arborescence cible
```
Inflation/
├── CLAUDE.md
├── PROMPT_CLAUDE_CODE.md      # prompt de lancement
├── data/raw/                  # base CSV brute (ne jamais modifier)
├── docs/                      # plan, spec du site, dictionnaire de données
├── euroinfl/                  # MOTEUR PYTHON EXISTANT (issu de euroinfl_moteur_inflation.zip)
│   ├── euroinfl/              #   package : data.py, engine.py, pipeline.py, sensitivity.py, backtest.py
│   ├── data/                  #   market_inputs.json, hicp_*_I25.csv, weights_2026.csv, CSV long
│   ├── out/                   #   sorties de run_all.py (CSV/JSON)
│   ├── site/                  #   ancien simulateur HTML (référence, sera remplacé)
│   └── run_all.py, run_backtest.py, summarize_backtest.py, MODELES.md
├── backend/                   # API FastAPI (à créer) — importe euroinfl, ne le duplique pas
└── frontend/                  # app React + TypeScript + Vite (à créer)
```

## Règles non négociables
1. **Le moteur est la source de vérité.** Le dashboard n'invente aucun chiffre : tout vient de `euroinfl/out/*` ou d'un appel au moteur. Pas de recalcul « approximatif » côté front, sauf l'approximation linéaire des chocs explicitement étiquetée (voir plan §4.3).
2. **Ne pas modifier la logique du modèle** (`engine.py`, `pipeline.py`, coefficients, `CONFIG`) sans demande explicite. Ajouter des fonctions d'export est autorisé ; les placer dans `backend/` ou un module `euroinfl/euroinfl/export.py` nouveau.
3. **Unités explicites partout** : glissement annuel en %, impacts en **bp**, contributions en **pp**, prix en $/t, €/MWh, $/bbl. Toujours afficher le mois du fixing au format `Nov-26`.
4. **Glissement annuel calculé en niveaux** sur t−12 exact (jamais de somme de variations mensuelles).
5. Marché (fixings HICPxT saisis) = **comparaison uniquement**, jamais injecté dans le modèle.
6. Ne jamais écraser `data/raw/`. Les entrées modifiables sont dans `euroinfl/data/market_inputs.json`.
7. Pas de clé API ni secret dans le dépôt. Fichier `.env` ignoré par git.

## Commandes
```bash
# Moteur
cd euroinfl && pip install pandas numpy && python run_all.py        # ≈ 15 s → out/
python run_backtest.py && python summarize_backtest.py              # ≈ 3 min (backtest_errors.csv n'est pas dans le zip)

# Backend (à créer)
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000

# Frontend (à créer)
cd frontend && npm install && npm run dev                          # http://localhost:5173
npm run build && npm run test
```

## Environnement
- Poste Windows (OneDrive), Python 3.11+, Node 20+. Utiliser des chemins `pathlib`, pas de chemins absolus en dur.
- Déploiement visé : frontend sur Vercel, backend sur Railway (ou mode 100 % statique, voir plan §3).

## Style de code
- Python : type hints, `ruff` + `black`, pydantic v2 pour les schémas API, tests `pytest`.
- TypeScript strict, composants fonctionnels, `eslint` + `prettier`, tests `vitest`.
- Graphiques : Apache ECharts (`echarts-for-react`). Une seule palette, définie dans `frontend/src/theme.ts`.
- Petits commits, un par étape du plan, message en français.

## Méthode de travail attendue
- Avant chaque phase : relire la section correspondante de `docs/PLAN_DASHBOARD.md`, annoncer le plan en 5 lignes, puis coder.
- Après chaque phase : lancer les tests, vérifier les **chiffres témoins** (plan §7) et cocher la case dans le plan.
- En cas de doute sur un chiffre ou une convention : lire `euroinfl/MODELES.md` puis le code du moteur, ne pas deviner.
