# Plan — Dashboard du modèle d'inflation HICPxT

> Objectif : un terminal de recherche web qui affiche **nos** prévisions (moteur `euroinfl`), explique **d'où elles viennent** et permet de **choquer les inputs**.
> Périmètre : EA, IT, FR, DE, ES · fixings Nov-26 → Dec-27 · données HICP jusqu'à oct. 2026, courbes au 20/11/2026.

---

## 1. Ce que le dashboard doit permettre

1. **Lire la prévision** : un fixing, un pays → BU, STAT, combinaison, marché, écart fair − marché en bp.
2. **Comprendre la prévision** : contributions énergie / alimentation transformée / non transformée / biens / services, et sous-postes énergie (carburants, fioul, gaz, électricité).
3. **Choquer** : TTF, gasoil, EUR/USD, électricité DE/FR, matières premières, salaires → impact en bp sur chaque fixing et chaque pays.
4. **Voir la transmission** : profils de pass-through, élasticités, équation de chaque sous-indice.
5. **Juger la fiabilité** : backtest (RMSE par horizon), poids de combinaison BU/STAT.
6. **Contrôler les inputs** : courbes de marché, mois récents estimés, historique des séries de la base.

---

## 2. Les vues (navigation latérale)

| # | Vue | Contenu | Sources (`euroinfl/out/`) |
|---|---|---|---|
| 1 | **Vue d'ensemble** | Bandeau KPI (prochain fixing : COMBINE, marché, écart bp ; dernier HICPxT publié). Graphe trajectoire : historique 2019→oct-26 + BU / STAT / COMBINE / marché sur les 14 fixings. Tableau 14 fixings × 5 pays (COMBINE) avec heatmap de l'écart au marché. Sélecteur pays. | `forecast_headline_models.csv`, historique HICP, fixings marché |
| 2 | **Pays** | Sélecteur EA/IT/FR/DE/ES. Barres empilées des contributions (pp) par fixing + ligne HICPxT. Tableau glissement annuel par composante. Détail énergie : 4 sous-postes. « Pont comptable » d'un fixing (waterfall énergie → aliment. → biens → services → total). | `forecast_components.csv` |
| 3 | **Simulateur de chocs** | Curseurs : TTF, gasoil ($), EUR/USD, power DE, power FR, mat. prem. alim., mat. prem. ind. (en %), salaires (pp/an). Case « électricité de gros entraînée par le gaz ». Presets (« Gaz +20 % », « Pétrole −15 % », « Euro fort »…). Résultat : trajectoire choquée vs base, tableau impact bp × fixing × pays, décomposition par sous-indice. Mode **instantané** (linéaire) + bouton **Recalcul exact** (appel moteur). | `sensitivity_fixings_bp.csv`, API `/api/simulate` |
| 4 | **Pass-through** | Profils de niveau 0-24 mois par driver × sous-indice × pays (graphe multi-lignes). Tableau des élasticités (actuel vs avant 2023, vitesse). **Explorateur d'équations** : pour un pays × sous-indice, la formule, les β par fenêtre, ρ, γ régime, R², t-stats. Zoom Italie gaz (MODELES §11). | `passthrough_profiles.csv`, `elasticities.csv`, `equations.json` |
| 5 | **Scénarios énergie** | Les scénarios de courbe gasoil (central, flat, full, brent_crack, brent_crack_full…) : courbe $/t utilisée + HICPxT / énergie / carburants qui en résultent, par pays. | `forecast_scenarios.csv` |
| 6 | **Backtest** | RMSE par horizon h1-h12, BU vs STAT vs naïf vs BU prix parfaits, par pays, toute période / depuis 2023. Graphe des erreurs par origine. Poids de combinaison w_h par pays. | `backtest_errors.csv` (à régénérer), `combo_weights.json` |
| 7 | **Inputs** | Courbes à terme (TTF, gasoil, Brent, power, EUR/USD) issues de `market_inputs.json`, avec mise en évidence des mois **estimés** (août-nov. 2026). Explorateur de la base CSV : choix d'une série dans les 97, graphe + métadonnées (source, unité, dernière date). | `euroinfl/data/market_inputs.json`, `data/raw/*.csv` |
| 8 | **Méthodologie** | Rendu de `MODELES.md` (markdown + tableaux), table des limites, date des données. | `euroinfl/MODELES.md` |

En-tête global : date des données (« HICP oct-26 · courbes 20/11/2026 »), sélecteur pays persistant, sélecteur modèle (BU / STAT / COMBINE), bouton « Recalculer » (désactivé en mode statique).

---

## 3. Architecture

```
euroinfl (Python, existant)
   │  run_all.py → out/*.csv, *.json
   ▼
backend/ (FastAPI)  ── lit out/, sert du JSON typé ; /api/simulate appelle Model.forecast(shocks=…)
   │  modèle ajusté une fois au démarrage (Model().fit() en cache, ~quelques s)
   ▼
frontend/ (React + TS + Vite + ECharts + TanStack Query + Zustand)
```

**Deux modes de déploiement, même frontend :**
- **Mode API** (complet) : backend Railway + frontend Vercel. Le recalcul exact des chocs et l'édition des inputs marchent.
- **Mode statique** (fallback) : `backend/export_static.py` écrit tous les JSON dans `frontend/public/data/` ; le front lit ces fichiers, le simulateur reste en mode linéaire. Variable `VITE_DATA_MODE=api|static`.

Choix techniques :
- **FastAPI + pydantic v2** : schémas explicites, doc auto `/docs`.
- **ECharts** : séries temporelles denses, heatmaps, waterfall, zoom.
- **TanStack Query** pour le cache des appels ; **Zustand** pour l'état global (pays, fixing, modèle, chocs).
- Pas de base de données au départ : les fichiers `out/` suffisent. Prévoir un dossier `runs/<horodatage>/` si on veut historiser les vintages plus tard.

---

## 4. Contrat d'API (backend)

Toutes les réponses : `{ "meta": { "asof", "last_obs", "run_id", "units" }, "data": … }`.

| Route | Réponse `data` |
|---|---|
| `GET /api/meta` | geos, fixings, items (codes + libellés FR), drivers de choc, scénarios, dates |
| `GET /api/headline?geo=EA` | `[{fixing, h, BU, STAT, w_BU, COMBINE, market, gap_bp}]` |
| `GET /api/history?geo=EA&item=TOT_X_TBC&from=2015-01` | `[{period, index, yoy}]` |
| `GET /api/components?geo=EA` | `[{fixing, item, yoy, contrib_pp}]` |
| `GET /api/sensitivities?geo=EA` | `[{shock, item, fixing, bp}]` (matrice +10 %) |
| `POST /api/simulate` | body `{scenario:"central", shocks:{ttf:1.2, gasoil:0.9, …}, link_power:true}` → trajectoires base / choc et delta bp par geo × item × fixing |
| `GET /api/passthrough?geo=IT&item=CP0452` | profils de niveau par driver, 0-24 m |
| `GET /api/elasticities` | table complète |
| `GET /api/equations/{geo}/{item}` | formule, coefficients, fenêtres, ρ, γ, R², t-stats |
| `GET /api/scenarios?geo=EA` | `[{scenario, label, item, fixing, yoy, gasoil_usd_t}]` |
| `GET /api/backtest` | RMSE par geo × modèle × horizon × période ; poids de combinaison |
| `GET /api/inputs/market` | contenu de `market_inputs.json` normalisé (courbes, recent_months, hypothèses) |
| `GET /api/inputs/series` / `GET /api/inputs/series/{code}` | catalogue des 97 séries / valeurs d'une série |
| `GET /api/methodology` | markdown de MODELES.md |

### 4.1 Ajustements validés en phase 0 (implémentés en phase 1)
- Fixings en ISO `YYYY-MM` dans l'API ; `/api/meta.fixings` fournit aussi `label` (`Nov-26`), `h` et `indicative` (h > 10).
- `market` / `gap_bp` = `null` hors EA ; fixings marché dans `euroinfl/data/market_fixings.json` (comparaison uniquement).
- `/api/components` : modèle BU ; ligne `item = CHAIN_RESIDUAL` (= HICPxT − Σ contributions).
- `/api/history` lue depuis `load_hicp()` (niveaux 2015-01 → 2026-10, g.a. en niveaux sur t−12 exact).
- `/api/passthrough?geo&item[&shock]` : profils 0-13 mois (borne des 14 fixings).
- `/api/equations` (index + `power_link`) et `/api/equations/{geo}/{item}` (aussi `EA-stage1/ppi_*`) : formule reconstruite, termes β/γ avec t-stats, saisonnalité effective.
- `/api/backtest` : RMSE `period = all | post2023`, biais depuis 2023, poids ; `/api/backtest/errors?geo&item&h&model` pour le graphe par origine.
- Simulateur (phase 5) : curseurs `ttf, gasoil, brent, eurusd, power_de, power_fr, food_commo, nonfood_commo, wages_pp` (voir `/api/meta.sim_inputs`) ; approximation instantanée en `ln(1+x)/ln(1,1) × bp(+10 %)` (linéaire pour les salaires) ; `link_power` multiplie l'électricité par `ttf^β`.
- Lecteur JSON UTF-8 puis cp1252 (JSON du moteur écrits en cp1252 sous Windows).

### 4.2 Market data et fixings (ajout du 22/11/2026)
| Route | Rôle |
|---|---|
| `GET /api/inputs/fixings` | fixings de marché saisis : EA HICPxT (comparé) et FR IPC hors tabac (affiché, non comparé) |
| `PUT /api/inputs/fixings` | saisie d'une courbe de fixings (jeton) ; archive l'ancien fichier |
| `POST /api/inputs/market/refresh` | proposition d'inputs depuis les sources publiques (jeton) |
| `GET /api/inputs/market/proposal` | proposition en attente + écarts ligne à ligne |
| `POST /api/inputs/market/apply` | applique, archive, relance le moteur, recharge l'API (jeton) |
| `GET /api/admin/status` | écritures autorisées ? jeton exigé ? |

### 4.3 Simulateur : deux vitesses
- **Linéaire instantané (front)** : impact = Σ_chocs (choc% / 10) × sensibilité_bp(+10 %). Valable car le modèle est linéaire en log (MODELES §10 : +20 % ≈ 2× l'effet, chocs additifs). Étiquette visible « approximation linéaire ».
- **Exact (back)** : `Model.forecast(scenario, shocks={…})` du moteur ; renvoie les trajectoires complètes. Débounce 600 ms, annulation des requêtes obsolètes. Afficher l'écart linéaire vs exact quand les deux sont disponibles.
- Correspondance curseur → argument moteur : facteur multiplicatif (`+20 %` → `1.2`). Vérifier dans `pipeline.py` / `sensitivity.py` les noms exacts des clés de choc (`ttf`, `gasoil`, `eurusd`, `power_de`, `power_fr`, `food_commo`, `nonfood_commo`, salaires…) et la gestion de « électricité entraînée ».

---

## 5. Phases et livrables

- [x] **Phase 0 — Inventaire et socle (½ j)** — fait le 22/11/2026, voir `docs/DATA_CONTRACT.md` (chiffres témoins tous conformes)
  Dézipper/vérifier `euroinfl/`, lancer `run_all.py`, lister chaque fichier de `out/` avec ses colonnes réelles et écrire `docs/DATA_CONTRACT.md` (schéma exact de chaque fichier). Repérer où sont stockés les fixings marché et l'historique HICP. Lancer le backtest pour produire `backtest_errors.csv`. `git init`, `.gitignore`, premier commit.
- [x] **Phase 1 — Backend lecture (1 j)** — fait le 22/11/2026 : 17 routes GET, 43 tests pytest (témoins §7 inclus), `export_static.py` (272 fichiers, 6,9 Mo)
  FastAPI, chargement de `out/` au démarrage, toutes les routes GET du §4, schémas pydantic, tests pytest qui vérifient les chiffres témoins (§7). `export_static.py`.
- [x] **Phase 2 — Frontend socle (1 j)** — fait le 22/11/2026 : layout 8 vues, palette validée (`theme.ts`), client typé api/statique, 12 tests vitest ; vérifié dans le navigateur (clair/sombre, 375 px, mode statique)
  Vite + React + TS, layout (barre latérale, en-tête, sélecteurs globaux), thème, client API typé (types générés depuis l'OpenAPI ou écrits à la main), formatage (`fmtPct`, `fmtBp`, `fmtFixing`).
- [x] **Phase 3 — Vues lecture (2 j)** — fait le 22/11/2026 : Vue d'ensemble, Pays, Scénarios énergie, Méthodologie ; chiffres témoins vérifiés à l'écran (`witness.test.tsx` sur l'export réel) ; « indicatif » = Oct-27 → Dec-27 (au-delà de h+10, h+0 = Nov-26)
  Vue d'ensemble, Pays, Scénarios énergie, Méthodologie.
- [x] **Phase 4 — Transmission (1 j)** — fait le 22/11/2026 : zoom Italie gaz (MODELES §11 vérifié à l'écran), profils 0-13 mois, élasticités, explorateur d'équations (étage 1 inclus) ; seul écart : énergie IT à 2 mois = 1,15 % (MODELES arrondit à 1,2)
  Pass-through, explorateur d'équations, élasticités.
- [x] **Phase 5 — Simulateur (1,5 j)** — fait le 22/11/2026 : `POST /api/simulate` (identique à 1e-6 près à la matrice pré-calculée), mode instantané en ln(1+x)/ln(1,1), presets, URL partageable ; TTF +30 % IT Jun-27 : exact +72,1 bp, approximation +70,9 bp (x/10 : +77,3 bp)
  Mode linéaire, puis `POST /api/simulate` et mode exact ; presets ; décomposition par sous-indice ; URL partageable (chocs encodés dans la query string).
- [x] **Phase 6 — Backtest et Inputs (1 j)** — fait le 22/11/2026 : RMSE (toute période / depuis 2023, MODELES §9 vérifié à l'écran), erreurs par origine, poids de combinaison, biais ; courbes et mois estimés, explorateur des 97 séries
  Tables RMSE, graphe d'erreurs, poids ; courbes, mois estimés, explorateur des 97 séries.
- [x] **Ajout du 26/11/2026 — vue Market data** : hypothèses de marché du moteur (Brent, gasoil, EUR/USD, prix à la pompe WOB, TTF, électricité) par scénario énergie, sélecteur « Scénario énergie » dans l'en-tête ; la vue d'ensemble montre ces trajectoires à la place du graphe de trajectoire HICPxT (`/api/market/paths`).
- [ ] **Phase 7 — Finition et déploiement (1 j)** — finition faite le 22/11/2026 (vues à la demande, filet d'erreur, export CSV/PNG, revue 375 px et sombre, Dockerfile, `railway.json`, `vercel.json`, README) ; **reste : la mise en ligne Railway + Vercel** (comptes du propriétaire)
  Responsive, mode sombre, états de chargement/erreur, export CSV/PNG des graphes, Dockerfile backend, déploiement Railway + Vercel, README.
- [ ] **Phase 8 (plus tard)** — Édition des inputs depuis l'UI puis relance de `run_all.py` en tâche de fond ; historisation des vintages ; ajout d'un modèle ML challenger ; vues Linkers / Auctions.

---

## 6. Design

- Style « terminal de recherche » sobre : fond clair par défaut + mode sombre, typographie tabulaire (`font-variant-numeric: tabular-nums`) pour les chiffres.
- Couleurs fixes par série : BU, STAT, COMBINE, marché (pointillé), historique (gris) ; composantes : énergie, alim. transformée, alim. non transformée, biens, services — mêmes couleurs dans toutes les vues.
- Chaque graphe : titre qui dit le message, unités sur l'axe, infobulle avec valeur exacte, source et date en pied.
- Les fixings au-delà de h+10 portent la mention « indicatif ».
- Toute valeur estimée (prix de gros août-nov. 2026, courbes reconstruites) est signalée visuellement (italique + icône « estimé »).

---

## 7. Chiffres témoins (tests d'acceptation)

Issus de `euroinfl/MODELES.md`. Le dashboard doit afficher exactement ces valeurs (à ±0,01 pp près) tant que les inputs n'ont pas changé (millésime de référence du 20/11/2026, figé dans `backend/tests/fixtures`).

Révision du 26/11/2026 (demandée) : bloc énergie refondu — carburants et fioul sur les prix à la pompe du Weekly Oil Bulletin, gaz et électricité à révisions des contrats à dates fixes (MODELES §4). Les témoins ci-dessous sont ceux du modèle révisé ; les anciens sont entre parenthèses.

| Test | Attendu |
|---|---|
| COMBINE EA Nov-26 / Jan-27 / Dec-27 | 3,82 % / 3,98 % / 2,31 % (avant : 3,93 / 4,14 / 2,35) |
| COMBINE IT Dec-26 | 5,95 % (6,35) |
| COMBINE DE Jun-27 | 2,94 % (3,08) |
| Marché EA Jan-27 | 4,23 % |
| Sensibilité TTF +10 % (élec. entraînée), IT Jun-27 | +22,0 bp (+25,8) |
| Sensibilité gasoil +10 %, EA Jun-27 | +14,5 bp (+18,0) |
| Salaires +1 pp/an, EA Dec-27 | +16,2 bp |
| Backtest RMSE EA BU h1 / h12 | 0,31 / 3,06 pp (0,36 / 2,98) |
| Poids énergie EA (hors tabac) | 9,2 % |

Si un chiffre diffère : ne pas « corriger » le front, chercher la cause (inputs modifiés, mauvaise colonne, unités) et la documenter.

---

## 8. Risques et points d'attention

- `backtest_errors.csv` n'est pas dans le zip : le régénérer (≈ 3 min) avant la phase 6.
- Les colonnes exactes de `sensitivity_fixings_bp.csv`, `passthrough_profiles.csv`, `elasticities.csv` et `equations.json` sont à confirmer en phase 0 (seules celles des fichiers headline / components / scenarios sont connues : voir `docs/DATA_CONTRACT.md` une fois écrit).
- Le `fit()` du modèle au démarrage du backend prend quelques secondes : le faire une fois, garder l'objet en mémoire, protéger par un verrou si plusieurs requêtes `simulate` arrivent en même temps.
- OneDrive : exclure `node_modules/`, `.venv/`, `__pycache__/` de la synchro si possible (ou travailler dans un clone hors OneDrive et pousser sur GitHub).
