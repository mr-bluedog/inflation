# Euro Inflation — Research Terminal : documentation de rétro-ingénierie

> Source : https://euro-inflation.vercel.app (exploré le 22/11/2026, données au 20/11/2026)
> But : servir de base pour **répliquer le site** puis **développer nos propres modèles de prévision d'inflation**.
> Légende : ✅ = observé directement (code/JSON lisible) · 🟡 = déduit des libellés UI · ❌ = non accessible (côté serveur / entraînement)

---

## 0. TL;DR

- **Objet** : terminal de recherche pour prévoir les **fixings mensuels HICPxT zone euro** (HICP hors tabac, base des OATei/BTP€i et des swaps zéro-coupon inflation EUR), sur 15 échéances (Oct-26 → Dec-27), et les comparer aux **fixings de marché**.
- **Deux modèles principaux, même ancrage et même énergie** :
  1. **BU PPI Sectorial V2** (bottom-up structurel : énergie de gros → PPI sectoriels → paniers coûts → indices retail → HICPxT). Le code et **tous les coefficients** sont publics côté client ✅.
  2. **ML Challenger E5** (ensembles de foundation models type Chronos-2 / TimesFM-3 / Toto-2 + régressions PLS / Ridge / Elastic Net par composante). Seuls les sorties et la composition sont visibles ❌.
- **Énergie commune** : moteur « Energy V2.4 / Gas V2.5 » (WOB retail + courbes ICE Gasoil/Brent/TTF + forwards électricité + calendriers de reset nationaux). 6 scénarios de courbe.
- **Synthèse** : « Mid ensemble » = BU 50 % / ML 50 % × 6 scénarios, calculé **en indices** (pas en y/y). Enveloppe min-max sur 12 trajectoires.
- **Couche pays** : 21 pays EA21, modèle « Country BU V4.3 » (composante EA + spread pays AR(1)), desks Tier-1 FR/DE/IT/ES avec contrats nationaux (CPIxT France, FOI Italie, CPI Espagne).
- **Couches annexes** : arène de backtest (38 familles de modèles), RV Linkers (OATi/OAT€i/BTP€i), stratégie d'adjudications (auctions), veille news + comité d'experts LLM (GPT × Claude × Gemini) avec règles de gouvernance strictes.
- **Philosophie** : tout se calcule **en niveaux d'indice**, chaînage annuel en décembre, dénominateurs t−12 exacts, aucune donnée « fake live », hash SHA-256 de chaque input/état, portes de publication (`CURRENT` bloqué tant que la validation n'est pas passée).

---

## 1. Concepts et conventions (à respecter dans la réplication)

| Concept | Définition sur le site |
|---|---|
| **HICPxT** | HICP zone euro hors tabac (Eurostat `TOT_X_TBC`, EA21 depuis 2026). Cible principale. |
| **Fixing** | Mois de référence de l'indice (ex. `Nov-26`) ; y/y = 100 × (I_t / I_{t−12} − 1). |
| **Horizon h** | h+0 = fixing courant (mois en cours non publié), h+11 = 11 mois plus tard. Le site affiche 14–15 fixings (Oct-26 → Dec-27). |
| **Origine** | `origin = 2026-10` (premier mois prévu). **Ancrage** = dernier mois officiel complet `anchor = 2026-09`. |
| **Composantes** | `energy`, `food` (alimentation hors tabac = processed ex tobacco + unprocessed), `goods` (NEIG), `services`. **Core** = goods+services. |
| **Poids 2026 (EA, hors tabac)** | energy 0.092125 · food 0.172603 · goods 0.257369 · services 0.477903 (somme 1) ; tabac 0.02024. Statut `FINAL_2026_X_TOBACCO_WEIGHTS`. |
| **Food 2026** | 117.71 ‰ processed ex tobacco + 51.40 ‰ unprocessed → poids normalisés 0.69606 / 0.30394. |
| **Chaînage** | Paniers chaînés en **décembre** (base `2025-12 = 100`) : `B_t = B_{Dec(y−1)} × Σ_k w_k · I_k,t / I_k,Dec(y−1)`. |
| **Index space** | Toute combinaison (BU/ML, scénarios, experts) se fait sur les **indices**, puis conversion y/y avec le dénominateur t−12 propre. Jamais de moyenne de taux y/y. |
| **Résidu de chaînage** | `residual = hicp − Σ w_k · yoy_k` (affiché, jamais « corrigé »). Typiquement ±2–6 bp. |
| **Base effect** | Les dénominateurs t−12 sont partagés et figés sur le vintage officiel → un écart BU vs ML ne peut **pas** venir d'un base effect. |
| **Anchor sept. 2026** | HICPxT final = 100 × (104.29 / 100.52 − 1) = **3.750497 %** (publié arrondi 3.8 %). Composantes : energy 18.9 · food 1.007 · goods 1.2 · services 3.2. |

Indices de référence HICP (ECB/Eurostat, non-constant tax, final 17-Sep-2026) ✅ :

| Période | energy | food | goods | services | hicpxt |
|---|---|---|---|---|---|
| 2025-08 | 98.92 | 100.389884 | 98.52 | 101.77 | 100.43 |
| 2025-09 | 98.85 | 100.298515 | 100.67 | 100.85 | 100.52 |
| 2025-10 | 98.69 | 100.471856 | 101.21 | 100.99 | 100.74 |
| 2025-11 | 99.63 | 100.529606 | 101.12 | 100.19 | 100.43 |
| 2025-12 | 98.78 | 100.46355 | 100.85 | 100.90 | 100.61 |
| 2026-01 | 99.57 | 101.207007 | 98.47 | 100.52 | 100.02 |
| 2026-02 | 100.16 | 101.400464 | 99.17 | 101.30 | 100.66 |
| 2026-03 | 107.14 | 101.483016 | 100.94 | 101.65 | 101.95 |
| 2026-04 | 110.33 | 101.86167 | 101.61 | 102.75 | 103.01 |
| 2026-05 | 109.00 | 101.677053 | 101.78 | 103.16 | 103.09 |
| 2026-06 | 106.99 | 101.300069 | 101.41 | 103.66 | 102.98 |
| 2026-07 | 109.86 | 101.156519 | 99.18 | 104.81 | 103.21 |
| 2026-08 | 113.07 | 101.132204 | 99.74 | 104.85 | 103.66 |
| 2026-09 | = I(2025-09) × (1 + anchor/100) | | | | |

---

## 2. Architecture technique observée

### 2.1 Stack
- **Front** : HTML + **JavaScript vanilla** (pas de framework détecté), ~45 fichiers JS et ~20 CSS chargés séparément, graphiques en **SVG faits main** (pas de lib de charts). Modules en UMD (`module.exports` ou `window.X`) → les moteurs tournent aussi sous Node ✅.
- **PWA** : `manifest.webmanifest`, `pwa-shell.js`, mode offline « stale-safe » (les prévisions live sont masquées hors connexion), bannière « New research terminal available ».
- **Back** : fonctions serverless **Vercel** sous `/api/*` (JSON). Stockage **Neon (Postgres) en mode append-only** (`storage_mode: neon_append_only_workspace`) pour fixings marché, brouillons, prévisions.
- **Auth** : certaines routes renvoient 409/credential (ex. `/api/app-runtime` 409). Fixings marché = `authenticated_user_input`.
- **Routage UI** : `?view=dashboard|countries|models|breakeven|auction|inputs|expert` (fonction `showTab()`).

### 2.2 Fichiers JS front (taille ≈ ko) ✅
| Fichier | Rôle |
|---|---|
| `sector-ppi-engine.js` (7) | **Moteur BU PPI** : `predict()` + `reprice()` (voir §5.2) |
| `ppi-central-data.js` (26) | **Calibration complète BU PPI** (`window.BU_PPI_DATA`) : betas, historiques, poids, saisonnalités |
| `country-ppi-engine.js` (6) | Ré-ancrage pays, forecast national PPI, pont CPI national, reconstruction EA depuis 21 pays |
| `country-index-accounting.js` (2) | Reconstruction headline pays en log-indices relatifs |
| `index-reanchor.js` (3) | Rejeu contrôlé quand une nouvelle publication officielle arrive |
| `bu-ml-arbitrage-engine.js` (13) | Arbitrage BU vs ML par composante × fixing (règles d'experts) |
| `inflation-risk-engine.js` (5) | Enveloppe de scénarios (60 trajectoires) |
| `bu-food-split-v1.js` (13) | Split processed/unprocessed (réconciliation MinT/WLS) |
| `oil-curves.js` (16) | Courbes Brent/Gasoil/TTF, crack, conversions, diagnostics |
| `dashboard-simulation.js` (11) | Recalcul « aperçu » avec nouveaux cours (coefficients gelés) |
| `primary-trajectory.js` (4) | Graphique principal |
| `ppi-hierarchy-engine.js` (18), `ppi-hierarchy-ui.js`, `ppi-central-ui.js` (28) | Hiérarchie PPI / UI |
| `anchor-shock-lab.js`, `nov4-anchored-runtime.js`, `nov4-anchor-ui.js` | Labo choc d'ancrage, runtime figé du 4 nov. |
| `country-reset-matrix(-data).js` | Matrice des resets gaz/électricité par pays |
| `ensemble-presentation.js` | Mid ensemble / enveloppe |
| `btp-italia-research.js` (21), `rv-cashflow.js` (12) | Linkers : BTP Italia, cash-flows RV |
| `trading-decision-ui.js` (17), `shadow-books-ui.js` | Décision de trading, shadow books |
| `input-workspace-ui.js`, `input-preview-ui.js` (18 chacun) | Saisie inputs / aperçu |
| `core/forecast-store.js`, `core/resource-pool.js`, `core/composition-diagnostic.js`, `forecast-bootstrap.js`, `view-loader.js` | Infra (store, chargement des vues) |
| `data-integrity.js`, `archive-scenario-safety.js`, `model-anchor-control.js`, `observability.js`, `session-expiry-ui.js` | Contrôles d'intégrité, télémétrie |

### 2.3 Endpoints API ✅ (taille de réponse)
| Endpoint | Taille | Contenu |
|---|---|---|
| `/api/data-inputs` | 8 k | Dernières obs. macro (EUR/USD, HICP, PPI, salaires), groupes d'inputs modèle, statut des connecteurs |
| `/api/input-database?view=monthly\|long` | 243 k | **Base macro mensuelle : 485 mois × 96 colonnes, 29 501 obs., 97 séries** (CSV) — très utile pour répliquer |
| `/api/market` | 26 k | Courbes ICE (Brent, Gasoil `qs`, TTF), FX, vintages, WOB |
| `/api/market-fixings` | 0.6 k | Fixings HICPxT saisis (marks marché) |
| `/api/wob-status` | 1.4 k | Statut d'ingestion du Weekly Oil Bulletin |
| `/api/forecast-state` | 1.3 k | État publié : hashes SHA-256 (inputs, coefficients, sensibilités, code, archive), porte de publication |
| `/api/forecast-preview` | 0.8 k | Brouillon de recalcul |
| `/api/ppi-central` | 0.2 k | Statut ancrage BU PPI |
| `/api/model-arbitrage` | 113 k | Arbitrage BU × ML : 15 lignes, 60 décisions, preuves news, food regime |
| `/api/country-model` | 1.4 M | **Tout le modèle pays** : 21 pays, méthodo, équations, paramètres, énergie nationale, desks, foundation, etc. |
| `/api/expert` | 522 k | Comité d'experts, desks, mémoire |
| `/api/news` | 646 k | Fil de news classé |
| `/api/intelligence` | 30 k | Santé de la veille |
| `/api/realtime-information` | 22 k | Calendrier publications, resets, fiscal |
| `/api/anchor-source-check` | 16 k | Contrôle des sources d'ancrage |
| `/api/reconciliation-audit` | 9 k | Audit de réconciliation |
| `/api/telemetry` | — | Télémétrie |

### 2.4 Gouvernance d'état (`/api/forecast-state`) ✅
```json
{
  "state_id": "<sha256>", "information_asof": "2026-11-04T23:00:00Z",
  "inputs_sha256", "coefficients_sha256", "sensitivities_sha256",
  "calculation_code_sha256", "archive_sha256",
  "reconciliation": {"energy": {"status":"BLOCKED", ...}, "countries": {"status":"BLOCKED", ...}},
  "publication_gate": {"current": false, "reasons": ["ENERGY_NOT_PASS","COUNTRIES_NOT_PASS",
    "SOURCE_COVERAGE_NOT_PASS","FIRST_RELEASE_NOT_PASS","BUILD_AUTHENTICATED_NOT_PASS","RESPONSIVE_NOT_PASS"]},
  "scope": "DATED_V2_GASOIL_ORIGIN_AND_INDEX_SCENARIO_CORRECTION"
}
```
Statuts récurrents : `CURRENT` / `STALE` / `BLOCKED` / `REVIEW_REQUIRED` / `REPRICE_REQUIRED` / `RESEARCH_HYPOTHESIS_ONLY` / `MARKET_COMPARISON_ONLY`.

---

## 3. Navigation et contenu des vues

Barre latérale : **Dashboard** (Forecasts) · **Countries** (FR·DE·IT·ES) · **Models** (Arena) · **Linkers** (RV·breakevens) · **Auctions** (Position·calendar) · **Inputs** (Sources) · **Expert** (News + Memory, badge 16 non lus).

En-tête global : « V2 officielle · V1 challenger · Validation en attente », « BU PPI SECTORIAL · ML E5 · PRÉVISIONS EA RECALCULÉES · COEFFICIENTS GELÉS », dates « Cours utilisés » et « Fixings », boutons **Publications officielles (Contrôle des sources)** et **Actualiser les cours (ICE / BCE / WOB)**. Bandeau : *Voir les cours · Recalculer BU / ML · Revenir à l'archive · Publication officielle en attente*.

### 3.1 Dashboard
1. **Inflation · vue d'ensemble (HICPxT · synthèse des modèles)** — sélecteur de fixing.
   - *MID ENSEMBLE* (ex. Dec-26 : 3.941 %, « BU 50 % · ML 50 % · six scénarios »).
   - *ENVELOPPE MIN–MAX* (3.868 – 4.010 %, « 12 trajectoires · sans probabilité associée »). Min = PPI/brent_crack, Max = ML/central.
   - *MARCHÉ DATÉ* (3.880 %, « 6.1 bp vs market »).
   - Graphe : Mid (ligne), bande min-max, marché (pointillé).
   - Note : *le Mid est calculé dans les indices et leurs bases, puis converti en y/y ; ce n'est pas le milieu des bornes.*
2. **Inflation desk (EURO AREA · HICPxT)** — onglets *BU PPI / ML E5 / Expert choice / Inputs & view*, sélecteur **ENERGY CURVE** (6 scénarios, §5.1), carrousel 14 fixings avec *modèle, marché, fair − market (bp)* ; au-delà de h+10 « Long terme · Indicatif ».
3. **Intraday market pulse** — Gasoil front, TTF front, Brent front, *front crack proxy* = Gasoil − 7.443 × Brent.
4. **Cours utilisés par BU/ML** — cartes Gasoil ($/t), Brent ($/bbl), TTF (€/MWh), EUR/USD BCE, variation vs clôture précédente, date du WOB utilisé.
5. **Trajectoires d'inflation** — Marché / BU PPI / ML E5 / Arbitrage, même hypothèse énergie.
6. **Inputs & methodology** — ancrage (3.8 % HICP, 3.751 % HICPxT final « settlement grade »), hypothèse énergie du fixing (ex. Nov-26 = 1285.88 $/t), vintages (market, central, sept. final, gasoil/FX, news).
7. **Pass-through** : choc **+1 % sur toute la courbe** cotée (Gasoil, TTF, Power FR, Power DE, Brent) → contributions Energy directe / Food / Goods / Services / résidu de chaînage / total (bp HICPxT). Ex. Nov-26 Gasoil +1 % → +2.254 bp energy, −0.285 bp chaînage, **+1.969 bp** total.
8. **Fixing decision lab** — long/short/no-trade : μ = fair BU/Hyb corrigé du biais, P(win) OOS, P&L OOS après 5 bp de coûts, edge net. « Today's watchlist » : plus gros écarts fair − marché.
9. **Fair-value accounting bridge** (ex. Nov-26 : energy +1.562 pp, food +0.203, goods +0.383, services +1.569, chaînage −0.019 → 3.697 %).
10. **Analyse détaillée** (5 workspaces) :
    - *Components* — contributions par composante × fixing ; atlas ECOICOP / agrégats spéciaux HICP.
    - *Monthly matrix* — 15 fixings × (HICPxT, Energy, Goods, Food, Services, Core, Fiscal/tarifs, sensibilités Gasoil/TTF/Power FR/Power DE), décomposition directe / →Food / →Goods.
    - *Real-time information stack* — calendrier des publications (flash FR/IT/ES/DE, flash EA, final EA), carte des resets gaz/électricité (DE, ES, FR, IT), fiscal (ex. baisse taxe carburant DE −17 c/l = −6.87 bp retirés une fois le WOB observé), régime (TRANSITION 2/4), first-published target (`prc_hicp_fpd`).
    - *Long-horizon audit* — Sep–Dec 2027 : énergie à indice nominal plat au-delà de l'horizon commodity/reset ; Food/Goods/Services = dérive sous-jacente Sep-27 + déviations calendaires robustes.
    - *Scenarios* — table des 6 scénarios (archive).
    - *M/M · seasonality · base effect* — m/m implicite vs médiane saisonnière robuste Eurostat (années pandémie exclues), garde-fou ±1.5σ.
    - *Model control* — Δ composante = tendance + saisonnalité + exogène + expert, z-score vs historique du mois (flag si |z| > 1.5).
    - *Energy pricing engine* — chaîne Wholesale → Reset cohort → Retail index → HICPxT (gaz, carburants, électricité, chauffage) ; timeline des parts de reset (Nov-26 0 % → Mar-27 85 % → 99 %).
    - *275-item basket* — 275 allocations ECOICOP (exports CSV/JSON) : médiane du mois + AR(1) shrinké, réconciliées au parent.
    - *Fixing desk sheet*, matrice gaz & électricité pays × mois (R = mois de reset), *Decision cockpit* (central / risque news / vue ajustée).

### 3.2 Countries
- Sélecteurs : **Pays** (FR, DE, IT, ES, EA21 reconciliation) · **Standard** (HICPxT harmonisé / contrat national : FR CPIxT, IT FOI, ES CPI) · **Méthode énergie** (6 scénarios) · **Modèle** (BU PPI réconcilié / ML Challenger E5).
- Badges de qualité (« FR TIER-1 · SEP RELEASE · GRADE A− », « FR HICP · STALE », bouton *Update country anchors*).
- Trajectoire 14 fixings + graphe (modèle sélectionné / Structural BU / réconciliation EA21).
- **Monthly decomposition** (21 pays) : Headline, Energy, Food, Goods, Services, Core, sensibilités Gasoil/TTF/Power +1 % (bp).
- **EA21 cross-section** : matrice fixing × 21 pays pour une composante/sensibilité.
- Notes : *« ML E5 utilise le signal d'indice relatif EA × loading national historique ; pas d'E5 national entraîné séparément. Energy reste structurelle. »* · « REVIEW · national Energy bridge · raw wedge 97.6 bp ».

### 3.3 Models (Arena)
Sélecteur de composante (HICPxT, HICP ex Energy, Energy, Food, Goods/NEIG, Services, Core). KPI : *Best h+0 0.169 pp (Market day 24) · Best h+5 0.832 pp (Chronos-2) · Best h+11 1.287 pp (Hyb Chrono+TimesFM)*. Trois sous-onglets :
1. **Prévisions BU / ML** — table BU vs ML aux mêmes cours.
2. **Validation historique** — test apparié strict *Market / Structural BU / EURO_AG V1.4* sur **32 origines** (voir §7).
3. **Recherche & diagnostics** — Performance matrix, **Backtest Lab** (géographie × composante × métrique RMSE/MAE/biais × horizon ; distribution d'erreurs ; « estimated vs realised » ; régimes pré-choc 2018-20 / choc énergie 2021-23 / normalisation 2024-26 ; export CSV), **Services Lab**, **Arbitration lab**, **Anchor shock lab**, **Forecast forensics**, **Strategy evidence** (RV pays), **263 sous-composantes ECB** (73 food, 89 goods, 101 services).

### 3.4 Linkers (RV · breakevens)
- **Market Data Hub** : 31 prix documentés (France + Italie), 18 flux calculables, 6/6 références FOI, « Promotion du modèle : non validée ».
- **Par titre** : ISIN, indice (HICPxT zone euro / CPI hors tabac France), clôture, *voisinage bp*, *flux bp*, DV01 (€/100/bp), carry 28 j, coûts observés. Statuts : « Extrémité de courbe · sans extrapolation », « Clôture de valorisation · sans transaction », « Moins de six pairs négociés ».
- **Valeur relative** : écart de rendement réel vs les **deux voisins du même indice** (positif = cheap, négatif = expensive), OAT€i et OATi séparés. Qualité T (séance avec échanges) / V (valorisation).
- **BTP Italia deep dive** (IT0005388175, oct. 2027) : prix observé 100.60 vs *Replay Mid* 99.105 (BU 50/ML 50 × 6 scénarios) ; min-max 98.898–99.247 ; FOI implicite ; limite FOI août 2027 ; BTP Italia Sì 2031 (coupon additif, ACT/ACT ICMA).
- Carry : rendement inchangé 28 j calendaires, ajusté au prochain jour TARGET, coupon + couru, avant financement.

### 3.5 Auctions (position · calendar)
- Cibles modèle par séance en **k€/bp** (Net = Cash BE + Swap), plafond +100 k€/bp, position enregistrée séparée, aucun ordre transmis.
- Événements : `FR-…-INDEXED`, `IT-…-BTPEI`, etc.
- **Backtest « Auction × ZC break-even »** : 135 adjudications AFT + Trésor italien, 120 couvertes (71 FR, 49 IT). Règles testées : *Governed D−10/D+10 calendar flip*, *Short BE D−5 → adjudication*, *Long BE adjudication → D+5*, *Short D−5 puis long D+5*, *Iota-gated post-auction*. Développement 2020-23 (68 evts, +2.69 bp/evt, Sharpe 0.60) vs **validation verrouillée 2024-26** (52 evts, +0.97 bp/evt, hit 48.1 %, P(mean>0) 74.2 %, IC90 −1.47/+3.48). Split : France +0.20 bp (plafond 25 k€/bp), Italie +1.95 bp (75 k€/bp). Coût 0.125 bp par unité de turnover.
- **BTP€i × EUR 5y5y** : meilleur combiné 50 % BTP€i + 50 % 5y5y même sens (Sharpe validation 1.18 → 1.53, DD −23 → −10 bp) ; hedge 100 % opposé détruit l'effet → le cycle est surtout du repricing inflation commun.

### 3.6 Inputs (Sources)
- Courbes ICE (Brent $/bbl, Low Sulphur Gasoil $/t, Dutch TTF €/MWh) par contrat de livraison, cliquables.
- **Prévisions conditionnelles · coefficients gelés** : choix du scénario Gasoil, modification des courbes → « Calculer aperçu BU/ML » (table archive → aperçu, Δ bp), export JSON daté.
- **Shared market fixings** : saisie/sauvegarde des marks HICPxT (partagés entre utilisateurs, ne modifient pas les prévisions).
- **Free data coverage** : 29 501 obs. · 97 séries · 485 mois × 96 colonnes (téléchargement monthly / long).
- Cartes : carburants WOB (Diesel, Euro95, fioul TTC), EUR/USD BCE, HICP/HICPxT, PPI (industrie, énergie, conso, alimentaire), coûts salariaux, groupes Goods/Food/Services, connecteurs (ENTSO-E, GIE AGSI/ALSI/ENTSOG, agriculture, fret, prix régulés).
- **Fuel input** : conversions (§5.1), front/M+5 slope ; **Gas input** TTF (règle no-double-count) ; **Electricity input** France monthly (FWT/FWT1) & Germany Cal (FPY/FPY1), scénario manuel plat ; **Nowcast carburants** du mois (couverture observée en jours, moyenne pondérée par jour).

### 3.7 Expert (News + Memory)
- **Global macro intelligence** : radar 547 sites (univers 1 188), 232 routes de requête, entonnoir 6 306 titres → retenus, triage **GPT-5.4 Mini**, « Bloomberg radar » (titres publics, pas de contournement de paywall).
- **Food regime evidence** (BU normalisation vs Chronos persistence) : score 4 piliers × 25 (amplitude, breadth, persistence, retail confirmation), seuils BU ≤ 39 / non résolu 40-70 / Chronos ≥ 71.
- **Committee transmission matrix** : contribution conditionnelle vs centrale acceptée (bp) par desk × fixing.
- **8 desks spécialistes** : HICP, Energy, Services, Goods, Food, Core, Country, Data Scientist (conviction /100, verdict DOWNSIDE_RISK / UPSIDE_RISK / INSUFFICIENT, preuves confirmées/watch, chaîne causale, test d'invalidation, action recommandée).
- **Research OS** : Detect → verify → map → quantify → challenge → decide → score ; file d'investigations ; newswire par région ; cockpits Energy (Gas & LNG, Oil & products, Power, Carbon & fiscal), Food, Goods, Services, Core, Fiscal.
- **EA21 weak-signal radar** : 705 investigations classées (z-score, lead r, contribution EA bp, persistance), moniteur de facteurs latents (Food 57.4 %, Energy 43.9 %, Goods 33.9 %, Services 25.5 % de variance du 1er facteur), meilleur lead transfrontalier (HR → CY energy r 0.73).
- **Research memory** : articles retenus (fiabilité, pertinence), export.

---

## 4. Données et sources

### 4.1 Sources officielles
| Source | Usage | Dataset |
|---|---|---|
| Eurostat HICP | Indices/taux mensuels, composantes, poids items/pays, first-published | `prc_hicp_minr`, `prc_hicp_midx`, `prc_hicp_iw`, `prc_hicp_cw`, `prc_hicp_fpd` |
| Eurostat STS | PPI (`sts_inpp_m`), prix import (`sts_inpi_m`), production (`sts_inpr_m`), services PPI (`sts_sepp_q`), services prod/CA (`sts_sepr_m`, `sts_setu_m`), construction (`sts_copr_m`) | |
| Eurostat tourisme | Nuitées (`tour_occ_nim`) | |
| Eurostat LCI | Coût horaire du travail (`lc_lci_r2_q`) | |
| BCE | EUR/USD (`EXR.D.USD.EUR.SP00.A`), M1-M3, crédits, Euribor, 10 ans, EER-12, salaires négociés, indices commodities non-énergie | |
| DG ECFIN | Enquêtes industrie/conso/commerce, ESI, BCI, anticipations de prix | |
| OECD | CLI zone euro | |
| CE **Weekly Oil Bulletin** | Prix pompe TTC/HT par pays (Diesel, Euro95, fioul), taxes, accises | publication jeudi, fenêtres UTC 09/11/13/15/17/19 h + rattrapage vendredi |
| **ICE Futures Europe** (JSON public différé) | Brent, Low Sulphur Gasoil, Dutch TTF — 12 contrats | jamais présenté comme live |
| ICE/EEX power | France monthly base (FWT), Germany Cal (FPY) | |
| INSEE / Istat / INE / Destatis | CPI nationaux, flashes | |
| ACER | Monitoring retail énergie | |
| Euronext / Borsa Italiana / AFT / MEF | Prix linkers, adjudications | |

### 4.2 Base d'inputs `/api/input-database` (colonnes visibles) ✅
`ecb_commodity_import_food_index`, `ecb_commodity_import_nonenergy_index`, `ecb_commodity_import_nonfood_index`, `ecb_ea_10y_yield`, `ecb_eer12_nominal`, `ecb_euribor_3m`, `ecb_euro_stoxx_50`, `ecb_loans_non_mfi_stock`, `ecb_m1/m2/m3_stock`, `ecb_negotiated_wages_yoy_current_vintage`, `ecfin_business_climate`, `ecfin_consumer_*` (confidence, economy/financial/goods-price/major-purchases/price/savings/unemployment expectations), `ecfin_economic_sentiment`, `ecfin_industry_*` (employment, production, selling-price expectations), `ecfin_intermediate_goods_price_expectations`, `ecfin_retail_business_expectations`, `es_construction_production_yoy`, `es_food_production_yoy`, `es_import_*_yoy`, `es_industrial_production_yoy`, `es_ppi_*` (capital/consumer/durable/non-durable/intermediate goods, energy, industry, manufacturing index & yoy, ex-energy, food), `es_services_production_yoy`, `es_services_turnover_yoy`, `es_tourism_nights_yoy`, `legacy_*` (agri_food, carbon, commodity, core, core_bbg, crude_1m/6m/vol, energy, eurcnh, eurusd, expectations, fao_food, food, food_ppi, gas_1m/6m, gasoil_1m/6m, goods, goods_bbg, headline, import_prices, jet_fuel, metal, pmi_* (composite, manufacturing, prices, services, long), power_de, power_fr, …).

Champs d'une observation : `code, label, value, period, frequency, geo (EA21/EA20), unit, source, quality_flag, model_use (candidate_driver | services_persistence_gate_only)`.

**Réplication QRF (papier académique)** — prédicteurs publics ajoutés : enquêtes DG-ECFIN, ESI/BCI, PPI par MIG, agrégats monétaires BCE, Euribor, 10 ans, EER-12, CPI/core/chômage US, CLI OCDE, salaires négociés, indices commodities. Proxy : EURO STOXX 50. Non reproductibles : IBES EPS LT, sous-indices Datastream, vintage Brent Bloomberg, Baltic Dry/ZEW historiques, vintages et code des auteurs.

### 4.3 Connecteurs non branchés
ENTSO-E (token requis), GIE AGSI/ALSI + ENTSOG (storage/LNG), agriculture (CE/FAO), fret (ports, niveaux du Rhin PEGELONLINE), prix régulés (pays × COICOP × date d'effet).

### 4.4 Snapshot marché (20/11/2026)
EUR/USD 1.0990 · Gasoil Dec-26 1178.00 $/t · Brent Jan-27 92.59 $/bbl (Dec-27 77.40) · TTF Dec-26 89.595 €/MWh (Nov-27 60.52) · Power FR front 163 €/MWh, DE Cal-27 154 €/MWh · WOB 26/10 : Diesel 2.2012, Euro95 2.0320, fioul 1.7473 €/L TTC.
Macro : HICP/HICPxT oct-26 4.0 % ; PPI industrie 9.7 %, énergie 34.1 %, conso 0.9 %, alimentaire −0.5 % (sept.) ; coûts horaires 3.6 % (T3).

---

## 5. Modèles

### 5.1 Énergie commune — « Energy V2.4 / Gas V2.5 » (🟡 + partiellement ✅)

**Conversions** ✅
- `EUR/bbl = USD/t ÷ EURUSD ÷ 7.443`
- `EUR/L  = USD/t ÷ EURUSD ÷ 1183.43`
- Crack initial : `C0 = Gasoil_front − 7.443 × Brent_front` ($/t) (ex. 614.22 $/t).

**Six scénarios de courbe Gasoil** (identiques pour BU et ML) ✅
| Clé | Libellé | Règle |
|---|---|---|
| `central` | Central · WOB flat 3M → ICE (**production**) | Nov–Jan restent au niveau de gros capturé avec le WOB courant ; Feb–Jul convergent en **6 pas** vers l'ICE **centré** (proxy 50/50 de deux livraisons adjacentes). |
| `flat3_trend` | Flat 3M + smooth backwardation | M+1..M+3 au niveau WOB, puis convergence lisse en 6 pas vers ICE centré. |
| `flat` | Flat at active front | Tous les fixings au front Gasoil actif. |
| `full` | Full centred ICE curve | Proxy centré 50/50 sur toute la courbe, sans pont WOB. |
| `brent_crack` | Brent + initial crack · freeze after 3 | `G(h) = 7.443 × B[min(h,2)] + C0` |
| `brent_crack_full` | Full Brent futures + initial crack | `G(t) = 7.443 × B(t) + C0`, Brent de la même livraison ; avant 1re livraison = front ; au-delà = dernier coté (hypothèse de queue) ; trou intérieur = indisponible (pas d'interpolation). |

Variante pays (Energy V2.4 central) : *WOB retail anchor ; Gasoil centré 50/50 jusqu'à M+3 puis niveau M+3 figé ; backwardation complète = scénario seulement*.

**Moteur retail énergie national** (depuis `/api/country-model`) ✅
- Énergie pays = ancre HICP énergie nationale observée + pont WOB TTC/HT carburants + **mix 55 % diesel / 45 % Euro95** + mouvement absolu WOB→ICE en €/L + **noyaux d'approvisionnement TTF** par pays (Gas V2.5) + **régimes de reset électricité**.
- Résidu énergie : `R^k_{c,t} = Δlog P^k_{c,t} − S^k_{c,month(t)} − λ^k_c · Σ_j κ^k_{c,j} · Δlog W^k_{t−j} − A^k_{c,t}` (S = saisonnalité locale, λ = élasticité, κ = noyau de procurement, A = impulsion de politique vérifiée). Prévision du résidu = **0** après le dernier indice retail observé, sauf mesures fiscales/tarifaires documentées.
- Gaz : `Δlog(retail gas) = saisonnalité pays + λ × (moyenne calendaire distribuée des variations TTF)` ; TTF front mappé obs. M → livraison M+1 ; ex. FR λ = 0.148 (prior EA), noyau lags 1/2/3 m poids 0.867/0.067/0.067 ; « appliqué une seule fois, pas de second multiplicateur de reset ».
- Électricité : mois de reset (FR : 1, 2, 8), `speed_per_reset 0.3`, proxy de gros 70 % FR / 30 % DE, λ opérationnel 0.135 (prior EA), noyau 18 mois équipondéré.
- Élasticités pays estimées sur indices nationaux I25, **shrinkées vers prior EA** (`country_gate: EA_PRIOR` tant que l'OOS pays ne valide pas).
- Poids sous-composantes énergie FR : électricité 0.33, gaz 0.158, fioul 0.027, solides 0.016, carburants 0.444, chaleur 0.025.
- Solides (CP0454) : AR(2) saisonnier.
- **Règle no-double-count** : TTF n'alimente l'électricité que s'il n'y a pas de forward power direct ; un prix retail observé (WOB) **remplace** l'hypothèse fiscale, ne s'y ajoute jamais.
- Mois courant : nowcast carburants = moyenne pondérée par jour (jours observés via WOB hebdo comme proxies + jours restants modélisés).
- Carte des resets (exemple) : DE gaz 1/4/7/10 λ 0.15, élec 1/3/9/10 λ 0.11 (mixed) · ES gaz 1/4/7/10, élec 1/2/3/4/9/10 λ 0.14 (indexed monthly) · FR gaz reset continu λ 0.15, élec 1/2/8 λ 0.14 (regulated reset) · IT gaz 1/4/7/10 λ 0.22, élec 1/10 λ 0.34 (regulated quarterly).

### 5.2 BU PPI Sectorial V2 (`BU_PPI_SECTORIAL_V2_PROCESSED_SCOPE`) ✅ — **modèle entièrement réplicable**

Notation : `Δ_t(X) = 100 · ln(X_t / X_{t−1})` ; `M(X, t, a, b) = moyenne_{i=a..b} Δ_{t−i}(X)`.
Entrées : historiques connus jusqu'à `2026-08` (PPI), imports jusqu'à `2026-09`, **12 mois de cotations de gros** à partir de l'origine : `oil, gas, power_fr, power_de` (prolongées plates après le 12e mois ; historiques Aug/Sep-26 portés depuis juillet).

**Étape 1 — PPI énergie industrielle** (AR + 4 actifs de gros, lag 0..2)
```
q_t = β0 + β1·q_{t−1} + β2·M(oil,t,0,2) + β3·M(gas,t,0,2) + β4·M(power_fr,t,0,2) + β5·M(power_de,t,0,2)
E_t = E_{t−1} · exp(q_t/100)
β = [0.26344, −0.12451, 0.23801, 0.02663, 0.02242, 0.11768]
```

**Étape 2 — PPI sectoriels NACE** (AR + imports lag 1:3 + énergie industrielle lag 1:6)
```
q^s_t = β0 + β1·q^s_{t−1} + β2·M(Import, t, 1, 3) + β3·M(E, t, 1, 6)
Import = food_import si NACE C10*/C11*, sinon nonenergy_import (prolongés plats)
```

**Étape 3 — Paniers de coûts** (food, goods), chaînés en décembre, base 2025-12 = 100
```
B_t = B_{Dec(y−1)} · Σ_s w_s · S^s_t / S^s_{Dec(y−1)}
poids non mappés → C10 (food) ou MIG_DCOG (goods)
```

**Étape 4 — Indices retail** (processed food, unprocessed food, goods ; 15 mois)
```
driver : processed → panier food ; unprocessed → indice food_import ; goods → panier goods
effect_t = β0 + β1·r_{t−1} + β2·M(driver, t, 1, 6)
L_t = L_{t−1} · exp((season_{month} + effect_t)/100)
si observation officielle (hash sha256 exigé) : L_t = obs ; r_t = Δ_t(L) − season
```

**Étape 5 — Food parent** : `F_t = F_{Dec} · (0.69606 · P_t/P_Dec + 0.30394 · U_t/U_Dec)`.

**Étape 6 — Reprice HICPxT** (`reprice`) : Energy et Services proviennent de la trajectoire baseline (moteurs Energy V2.4 et Services), Food et Goods de la projection PPI. On reconstruit les niveaux des 4 composantes, deux paniers chaînés (ancien/nouveau), et :
```
HICP_new_t = HICP_old_t · Basket_new_t / Basket_old_t
y/y = 100·(HICP_new_t / HICP_new_{t−12} − 1)
core = (w_g·goods + w_s·services)/(w_g + w_s)
low/high décalés du même delta ; statut "CENTRAL" pour i<12, "RECURSIVE TAIL" au-delà
```

**Paramètres retail** ✅
| | β = [const, AR(1), driver lag1:6] | résidu précédent |
|---|---|---|
| processed | [−0.03816, 0.43598, 0.39677] | −0.31700 |
| unprocessed | [0.01422, 0.14992, 0.04531] | 1.14739 |
| goods | [−0.07243, −0.01860, 0.74632] | 0.0 |

Saisonnalités mensuelles (Δlog ×100) :
| mois | processed | unprocessed | goods |
|---|---|---|---|
| 1 | 0.2873 | 1.0771 | −2.3757 |
| 2 | 0.1438 | 0.3209 | 0.2197 |
| 3 | 0.1436 | 0.1736 | 1.9015 |
| 4 | 0.0992 | 0.4268 | 0.5966 |
| 5 | 0.0902 | 0.4864 | 0.0709 |
| 6 | 0.0700 | −0.0797 | −0.2178 |
| 7 | 0.1294 | −0.6033 | −2.4168 |
| 8 | 0.1285 | −0.4591 | 0.2662 |
| 9 | 0.0000 | 0.1305 | 2.1210 |
| 10 | 0.1104 | 0.1609 | 0.6395 |
| 11 | 0.1535 | 0.3345 | 0.1371 |
| 12 | −0.0152 | 0.5007 | −0.1226 |

**Coefficients sectoriels** β = [const, AR(1), imports 1:3, énergie 1:6] ✅
| NACE | β0 | β1 | β2 | β3 | poids panier |
|---|---|---|---|---|---|
| C10 | 0.05485 | 0.48201 | 0.04475 | 0.08728 | food 0.2970 (+unmapped) |
| C101 | 0.07076 | 0.38007 | 0.07428 | 0.09606 | — |
| C102 | 0.11019 | −0.04785 | 0.07283 | 0.15426 | food 0.0251 |
| C103 | 0.11301 | 0.27627 | 0.0 | 0.07802 | — |
| C104 | 0.05314 | 0.55297 | 0.04706 | 0.05644 | food 0.0161 |
| C1041 | 0.05347 | 0.52502 | 0.05719 | 0.05894 | food 0.0228 |
| C105 | 0.02083 | 0.61952 | 0.01532 | 0.07019 | — |
| C1051 | 0.01807 | 0.62676 | 0.01809 | 0.06703 | food 0.1508 |
| C1052 | 0.07263 | 0.08745 | 0.02313 | 0.10058 | food 0.0154 |
| C106 | −0.02962 | 0.50633 | 0.07041 | 0.16372 | food 0.0083 |
| C107 | 0.09152 | 0.37130 | 0.02177 | 0.08028 | — |
| C1071 | 0.10128 | 0.37677 | 0.01016 | 0.07942 | food 0.1625 |
| C1073 | 0.02825 | 0.15971 | 0.03512 | 0.16867 | food 0.0159 |
| C108 | 0.07776 | 0.48700 | 0.01708 | 0.06271 | — |
| C1081 | −0.06684 | 0.43795 | 0.00018 | 0.15944 | food 0.0042 |
| C1082 | 0.13874 | 0.49033 | 0.00382 | 0.01534 | food 0.0375 |
| C1083 | 0.13606 | 0.41031 | 0.04461 | 0.06812 | food 0.0437 |
| C1084 | 0.15388 | 0.29263 | 0.0 | 0.07422 | food 0.0181 |
| C1032 | 0.13494 | 0.26666 | 0.05461 | 0.01825 | food 0.0176 |
| C11 | 0.10169 | 0.32184 | 0.0 | 0.03740 | food 0.0661 |
| C1102 | 0.09645 | 0.02221 | 0.00502 | 0.04360 | food 0.0558 |
| C1105 | 0.14268 | 0.31209 | 0.0 | 0.02971 | food 0.0429 |
| C13 | 0.09655 | 0.25976 | 0.00106 | 0.07692 | goods 0.0202 |
| C14 | 0.07256 | 0.07040 | 0.0 | 0.02828 | goods 0.1518 |
| C15 | 0.16168 | −0.00516 | 0.0 | 0.03986 | goods 0.0334 |
| C17 | 0.02253 | 0.61782 | 0.02220 | 0.09992 | goods 0.0076 |
| C18 | 0.03659 | 0.20130 | 0.0 | 0.09892 | goods 0.0328 |
| C204 | 0.11996 | −0.01607 | 0.00950 | 0.11465 | goods 0.0799 |
| C21 | 0.01667 | 0.08089 | 0.00300 | 0.00493 | goods 0.0431 |
| C26 | −0.02697 | 0.38354 | 0.00197 | 0.02775 | goods 0.0564 |
| C27 | 0.08866 | 0.27450 | 0.01046 | 0.05948 | goods 0.0421 |
| C29 | 0.07486 | 0.14451 | 0.0 | 0.03121 | goods 0.1405 |
| C30 | 0.07820 | 0.14259 | 0.0 | 0.02925 | goods 0.0193 |
| C31 | 0.14205 | 0.14874 | 0.0 | 0.07560 | goods 0.0667 |
| C32 | 0.11494 | 0.19983 | 0.00041 | 0.03103 | goods 0.0762 |
| MIG_DCOG | 0.12102 | 0.17892 | 0.0 | 0.05915 | goods fallback (unmapped 0.2301) |

Couverture : food 99.98 % (correspondance directe 44.5 %, reste via proxys NACE plus larges), goods 77.0 % (23.0 % non mappé → MIG_DCOG). Mapping ECOICOP→NACE item par item dans `processed_scope_items` (statuts `official_direct`, `official_broader_proxy`, `research_broad_fallback`).

Historiques fournis (2025-12 → 2026-08/09) : PPI énergie industrielle, chaque NACE, imports food/non-énergie, gros (oil, gas, power_fr, power_de), indices retail processed/unprocessed/goods, food parent. → voir `ppi-central-data.js`.

**Limitations déclarées** : correspondance NACE/ECOICOP partielle (pas d'identité supply-use officielle), pas de vintages first-release (tests de latence 45/75 j sur données révisées), Aug/Sep-26 de gros manquants (report de juillet), modèle EA uniquement, pas de calibration trading prospective. Backtest historique : 128 origines 2015-01 → 2025-08, h 0..11, *pas de gain RMSE matériel*.

### 5.3 BU Food split V1 ✅
- Priors indépendants : trajectoires **Chronos-2** pour FOODPX (processed) et FOODUN (unprocessed).
- Réconciliation : **moindres carrés contraints pondérés par la variance (forme MinT/WLS)** en niveaux d'indice ancrés sur sept. 2026, sous contrainte : relatifs pondérés (0.696/0.304) = relatif de l'indice Food total BU (le total BU n'est pas modifié). Variances = RMSE par horizon (processed 0.20 → 3.74, unprocessed 0.84 → 3.57).

### 5.4 ML Challenger E5 ❌ (composition seulement)
- Prévoit des **indices mensuels** par composante (Food, Goods, Services) ; Energy = même chemin V2.4 que le BU.
- Familles par composante :
  - **Food** : Chronos-2, PLS(4), Elastic Net, Ridge, Bayesian Ridge
  - **Goods** : Toto-2 313m, Toto-2 4m, Toto-2 22m, TimesFM-3, Chronos-2
  - **Services** : Chronos-2, PLS(4), TimesFM-3, Ridge, Bayesian Ridge
- Natif jusqu'à Sep-27, récursif jusqu'à Dec-27. Covariables calendaires (Pâques, jours ouvrés, années bissextiles, fêtes mobiles) connues ex-ante. Aucun fixing marché utilisé.
- Pays : signal d'indice relatif EA E5 × **loading national historique** (borné [0.35, 1.65], correction plafonnée 0.75 pp).
- « Hyb BU + Chronos » (production-safe) : innovation EA Chronos appliquée à Food/Goods/Services via loading pays shrinké vers 1 ; TimesFM = recherche uniquement.

### 5.5 Synthèse Mid / enveloppe (`inflation-risk-engine.js`, `ensemble-presentation.js`) ✅
- **Mid ensemble** : moyenne 50/50 BU/ML sur les 6 scénarios, en indices, reconversion y/y.
- **Enveloppe risque** : 6 scénarios × 8 combinaisons BU/ML par composante (masque binaire sur food/goods/services) + 2 trajectoires natives = **60 trajectoires** ; reconstruction en indices absolus avec chaînage décembre et dénominateurs t−12 propres. Statut `SCENARIO_ENVELOPE_NOT_PROBABILITY`.
- Attribution directe (énergie) / indirecte (food+goods) = contrefactuels séparés **non additifs** ; spread services BU/ML ≠ effet de second tour (non identifié causalement).
- Dashboard : enveloppe min-max sur 12 trajectoires (6 scénarios × BU/ML).

### 5.6 Arbitrage BU × ML (`BU_ML_EXPERT_ARBITRAGE_V2` / moteur `PPI_ML_EXPERT_SELECTION_V7`) ✅
Par fixing × composante (food, goods, services ; energy = partagée) : sélection **BU**, **ML** ou **BLEND** (poids ML explicite), sinon **UNRESOLVED** — **jamais de moyenne par défaut**.
- 4 piliers de preuve : skill historique par composante/horizon (pseudo-OOS, poids inverse-erreur), breadth des 21 pays, news datées spécifiques au fixing, revue adversariale **GPT × Claude × Gemini**. Poids ML max **0.82** ; décisions longue queue / preuves minces shrinkées vers 50/50.
- Revue valide si : contexte identique (clé canonique des coûts/coefficients/trajectoires), âge < 24 h, 3 experts distincts (ou 1 en politique `SINGLE_ECONOMY`), consensus documenté (rationale, why_not_other, invalidation), ≥ 2 sources indépendantes (domaines distincts) dont 1 primaire, publiées < 5 jours (ou observation officielle de coûts vérifiée < 6 h), confiance ≥ 60 (≥ 40 pour h ≥ 12).
- Combinaison en **espace d'indices** : `L_sel = (1−w)·L_BU + w·L_ML` puis headline via ratio de paniers.
- Diagnostics : Δ y/y, Δ m/m, gap numérateur vs dénominateur, contribution HICPxT bp, cause (momentum courant vs niveau accumulé).
- Exemple Oct-26 food : BLEND 51.7 % ML ; historique BU RMSE 0.905 pp vs ML 0.283 pp (n=44) ; pays 14 % alignés ; news THIN.

### 5.7 Modèle pays — Country BU V4.3 / EURO_AG V1.3.2 ✅ (structure + paramètres)
- **Équation** : composante pays = composante structurelle EA gouvernée + **un spread pays persistant mean-reverting** (AR(1), ρ shrinké vers 0.82 ; moyennes de spread par mois calendaire fortement shrinkées). Ex. FR : food ρ 0.923, LR spread −0.46 pp, σ 0.43 ; goods ρ 0.743 ; services ρ 0.804. Ancienne prévision récursive en taux annuel = challenger à poids 0.
- **Modèles ridge par composante** (espace : variations mensuelles des y/y standardisées) : `Δy/y = intercept + AR(2) + saisonnalité mensuelle + blocs de lags énergie` (blocs retenus seulement si RMSE glissant s'améliore ≥ 2 %). Ex. FR food λ=1, OOS RMSE 0.523 vs 0.598 baseline (n=44) ; goods λ=20 ; services λ=5.
- Estimation 2015 → 2026-09, **2020-2021 exclus**, queues winsorisées.
- Décomposition par mois : trend / seasonality / exogenous / expert / observed_release.
- Agrégation : poids pays COWEA21 2026 × part TOT_X_TBC ; la dernière ancre HICPxT directe reste exacte.
- **Pont CPI national** (FR CPIxT, IT FOI, ES CPI) : ancre nationale officielle + pente HICP pays + spread lissé état-espace ; dérive totale plafonnée ±16 bp, mouvement mensuel ±4 bp ; tabac : CPIxT direct = grade A, sinon grade B via dernier wedge tabac. Le CPI national n'écrase jamais l'HICPxT harmonisé.
- **Reconstruction EA indépendante** (`reconstructEA`) : chaînage décembre des relatifs d'indices des 21 pays (4 pays calibrés PPI nationaux + 17 priors structurels), poids pays/composantes 2026 gelés sur 2027, pas de wedge forcé à zéro vs EA ; écart mesuré en bp.
- **Release handling** : une publication nationale remplace le mois correspondant une fois ; l'innovation du niveau d'indice est portée jusqu'à t+11 et s'annule en y/y à t+12.
- Facteurs latents (fenêtre sept-2021 → sept-2026) : part du 1er facteur Food 57.4 %, Energy 43.9 %, Goods 33.9 %, Services 25.5 %.
- Desks Tier-1 FR/DE/IT/ES : `COUNTRY_TIER1_V2` (BU national live + résidu Chronos en espace d'indices) et `COUNTRY_FIXING_DESK_V4_1` (contrats nationaux, incertitude 68 %, backtest, bridge V3, etc.).

### 5.8 Services Lab ✅
- Modèles : BU, **Compact** (pipeline unique processed food / unprocessed food / goods + mémoire annuelle même mois), Chronos-2, TimesFM-3 ; moteur calendaire ex-ante commun.
- RMSE : Compact 0.714 pp (biais +0.044) · TimesFM-3 0.725 · Chronos-2 0.839 (biais −0.406) · gate causal Compact/TimesFM 0.698 (−2.3 %, bootstrap 100 %).
- Pâques 2026 (5 avr.) → 2027 (28 mars) : +10.5 bp mars / −10.4 bp avril HICPxT, s'annule en mai.
- Décision : **Compact = candidat central interprétable**, gate Compact/TimesFM en shadow.

### 5.9 Index re-anchor (rejeu contrôlé) ✅
Quand une publication officielle arrive : conserver chaque mouvement mensuel de composante et le facteur headline/panier de l'ancienne trajectoire ; les observations officielles remplacent **seulement** leur propre indice ; refus si changement de poids ou d'origine.

### 5.10 Autres modèles « recherche » listés
EURO_AG V1.4 (résidu multivarié, Goods verrouillé), HYB V2 Component Specialists (Food Chronos · Goods N-HiTS · Services iTransformer), EA vNext (horizon × energy gate), Governed AI, Kalman DMA, Fast/Slow Index, Market Kalman (diagnostic), STAR, BVAR, UC-SV, Dynamic Factor, GAM, Factor ridge, QRF, Extra Trees, Boosting, TabPFN-3.5, Moirai 2.0, Moirai-MoE, TiRex-2, Timer-XL, N-HiTS, TiDE, PatchTST, TSMixer, N-BEATS, iTransformer, Markov-Switching TVP, facteur probabiliste hiérarchique, SARIMA/ETS/Theta/TBATS + calendrier.

---

## 6. Gouvernance (règles transverses à reproduire)

1. **Pas de fake live** : chaque cotation porte sa date de session ; variation journalière affichée seulement si cohérente (`|100·d/(v−d) − p| ≤ 0.05`) et non nulle-ambiguë.
2. **Coefficients gelés** : l'actualisation des cours recalcule les prévisions (« aperçu ») sans ré-estimer ; la publication officielle exige validation.
3. **Hashing** de tout (inputs, coefficients, code, archive, observations retail via `source_sha256`).
4. **Append-only** pour fixings et prévisions.
5. **Anti-leakage** : les publications ne peuvent pas re-pricer une prévision scorée ; first-published comme cible de scoring.
6. **News ne modifie jamais le central automatiquement** : seulement via gate (preuve primaire fraîche + transmission mesurée + comité).
7. **No double count** (énergie, fiscal, PPI).
8. **Pas d'interpolation/extrapolation silencieuse** : manquant = indisponible.
9. Les poids d'experts ne sont pas des probabilités calibrées (`NOT_A_CALIBRATED_TRADING_PROBABILITY`).

---

## 7. Résultats de backtest (HICPxT, RMSE pp, 2018-12 → 2026-07)

Test apparié strict (32 origines, même ombre énergie) :
| Modèle | h0 | h1 | h2 | h3 | h5 | h8 | h11 |
|---|---|---|---|---|---|---|---|
| Market day 24 | 0.101 | 0.200 | 0.280 | 0.306 | 0.326 | 0.468 | 0.584 |
| Structural BU | 0.401 | 0.600 | 0.765 | 0.868 | 0.926 | 0.928 | 1.084 |
| EURO_AG V1.4 | 0.405 | 0.607 | 0.784 | 0.884 | 0.969 | 0.991 | 1.092 |

Scoreboard élargi (échantillons différents, non classables strictement) :
| Modèle | h0 | h2 | h5 | h8 | h11 |
|---|---|---|---|---|---|
| Market day 24 | 0.169 | 0.560 | 1.227 | 2.016 | 2.756 |
| Structural BU V1.3.2 | 0.533 | 1.056 | 1.729 | 2.403 | 3.534 |
| Chronos-2 (44 orig.) | 0.180 | 0.396 | **0.832** | 1.304 | 1.688 |
| TimesFM-3 | 0.196 | 0.502 | 0.976 | 1.533 | 2.009 |
| Hyb Chrono+TimesFM | 0.421 | 0.762 | 0.938 | 1.121 | **1.287** |
| Toto 2.0 · 4m | 0.188 | 0.451 | 0.862 | 1.317 | 1.623 |
| HYB V2 Specialists | 0.190 | 0.420 | 0.843 | 1.256 | 1.550 |
| TiRex-2 | 0.177 | 0.461 | 0.928 | 1.503 | 1.965 |
| Theta + calendrier | 0.238 | 0.448 | 0.901 | 1.422 | 1.886 |
| BVAR | 0.360 | 0.796 | 1.417 | 2.111 | 2.788 |
| AR(2) + saison | 0.376 | 0.851 | 1.516 | 2.220 | 2.885 |
| Boosting | 0.372 | 0.756 | 1.192 | 1.582 | 2.199 |

Protocole : origines glissantes expansives, h0 = fixing du mois courant, marché = snapshot du 24 du mois (plus d'info intramensuelle), erreur = prévision − réalisé, y/y reconstruit sur dénominateur t−12 exact. Pour les challengers de composantes, HICPxT recomposé avec le même chemin énergie. Avertissement : le pré-entraînement des foundation models peut recouvrir l'historique → pseudo-OOS.

Stratégies RV pays (holdout gelé 2024-26) : **ES−EA** 71.5 bp/trade, hit 82 %, t 4.37 (n=17) · FR−EA 28.9 bp, 94 %, t 5.27 (sensible aux coûts) · FR−ES 48.2 bp · IT−ES 42.8 bp ; FR−IT et IT−EA rejetés.

---

## 8. Snapshot des prévisions (cours du 20/11/2026, scénario central)

| Fixing | BU PPI | ML E5 | Marché | BU − mkt (bp) |
|---|---|---|---|---|
| Nov-26 | 3.697 | 3.724 | 3.76 | −6.3 |
| Dec-26 | 4.007 | 4.010 | 3.88 | +12.7 |
| Jan-27 | 4.146 | 4.222 | 4.23 | −8.4 |
| Feb-27 | 4.034 | 4.064 | 4.08 | −4.6 |
| Mar-27 | 3.646 | 3.699 | 3.64 | +0.6 |
| Apr-27 | 3.223 | 3.162 | 3.03 | +19.3 |
| May-27 | 3.503 | 3.265 | 3.21 | +29.3 |
| Jun-27 | 3.687 | 3.336 | 3.56 | +12.7 |
| Jul-27 | 3.256 | 2.808 | 3.21 | +4.6 |
| Aug-27 | 2.835 | 2.497 | 2.95 | −11.5 |
| Sep-27 | 2.367 | 1.964 | 2.36 | indicatif |
| Oct-27 | 2.122 | 1.762 | 2.27 | indicatif |
| Nov-27 | 2.284 | 1.937 | 2.50 | indicatif |
| Dec-27 | 2.203 | 1.816 | 2.48 | indicatif |

Contributions BU Nov-26 : energy +1.562 pp (15.4–17.0 % y/y), food +0.203 (1.17 %), goods +0.383 (1.49 %), services +1.569 (3.28 %), résidu −0.019 → 3.697 %.
Archive du 4 nov. par scénario (BU, Nov-26 / Jun-27 / Dec-27) : central 3.566 / 3.818 / 1.960 · flat3_trend 4.021 / 3.752 / 1.948 · flat 3.780 / 4.096 / 2.429 · full 3.566 / 3.672 / 1.885 · brent_crack 3.750 / 4.041 / 2.370 · brent_crack_full 3.780 / 3.990 / 2.280.
Marks marché complets (20/11) : Oct-26 3.95 · Nov-26 3.76 · Dec-26 3.88 · Jan-27 4.23 · Feb-27 4.08 · Mar-27 3.64 · Apr-27 3.03 · May-27 3.21 · Jun-27 3.56 · Jul-27 3.21 · Aug-27 2.95 · Sep-27 2.36 · Oct-27 2.27 · Nov-27 2.50 · Dec-27 2.48.

---

## 9. Ce qui n'est PAS accessible (à construire nous-mêmes)

| Élément | Statut | Ce qu'il faudra faire |
|---|---|---|
| Moteur Energy V2.4 / Gas V2.5 (calcul) | ❌ serveur | Recoder à partir des règles §5.1 + estimer λ, noyaux, resets |
| Moteur Services (BU/Compact) | ❌ | Recoder (AR + saison + calendrier Pâques + pipeline) |
| Estimation des betas BU PPI | ❌ (seuls les résultats) | Reproduire l'OLS/ridge AR+lags sur Eurostat STS |
| ML E5 (entraînement, checkpoints, sélection) | ❌ | Pipeline Chronos-2 / TimesFM / Toto / PLS / Ridge, backtest |
| Modèle pays (fit ridge, spreads AR) | 🟡 paramètres visibles | Recoder estimation |
| Ingestion (Eurostat, BCE, WOB, ICE JSON) | ❌ | Jobs cron + stockage |
| Pipeline news + comité LLM | ❌ | Optionnel en phase 2 |
| Historique complet des vintages | ❌ | Commencer à archiver dès maintenant |
| Base macro mensuelle | ✅ téléchargeable | Récupérer `/api/input-database?view=monthly` (CSV) |
| Calibration BU PPI complète | ✅ | Copier `ppi-central-data.js` |

---

## 10. Plan de réplication proposé (à discuter)

**Phase 1 — Socle données** : Python (pandas) + Postgres/DuckDB append-only ; fetchers Eurostat SDMX (`prc_hicp_midx`, `prc_hicp_iw`, `prc_hicp_cw`, `sts_inpp_m`, `sts_inpi_m`…), BCE SDW, WOB (XLSX), ICE (saisie manuelle ou JSON différé). Hash de chaque vintage.
**Phase 2 — Bibliothèque « index space »** : chaînage décembre, reconstruction headline depuis composantes, y/y sur t−12, résidu de chaînage, re-anchor. Tests unitaires contre les chiffres du site (ex. sept. 2026 = 3.750497 %).
**Phase 3 — Énergie** : conversions, 6 scénarios de courbe, nowcast carburants WOB, gaz/électricité avec resets.
**Phase 4 — BU PPI** : port direct de `sector-ppi-engine.js` + données ; reproduire Nov-26 = 3.697 % ; puis ré-estimer les betas nous-mêmes.
**Phase 5 — ML** : baselines (AR(2)+saison, Theta, SARIMA) puis Chronos-2/TimesFM sur indices de composantes avec covariables calendaires ; backtest h0..h11 vs marché.
**Phase 6 — Synthèse, arbitrage, pays, UI** (Next.js/React ou vanilla), puis Linkers/Auctions/Expert.

---

*Document généré à partir de l'exploration du site public ; les chiffres sont des snapshots du 20–22/11/2026.*
