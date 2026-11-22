# Contrat de données — sorties du moteur `euroinfl`

> Établi en phase 0 (22/11/2026) à partir d'un run réel sous Windows (Python 3.14, pandas 3) :
> `python run_all.py` (8,9 s) puis `python run_backtest.py` (65 s) et `python summarize_backtest.py`.
> Les sorties régénérées sont **identiques en contenu** à celles livrées dans le zip (CSV octet pour octet ;
> JSON identiques une fois parsés, seules les fins de ligne passent en CRLF).
> Référence de vérité : `euroinfl/MODELES.md` et le code. Ce document décrit **ce qui est réellement écrit**, pas ce que le plan supposait.

---

## 0. Conventions transverses

| Sujet | Constat | Conséquence pour le backend |
|---|---|---|
| Géographies | `EA`, `IT`, `FR`, `DE`, `ES` (ordre `data.GEOS`) | enum `Geo` |
| Fixings | chaînes ISO `YYYY-MM`, 14 valeurs `2026-11` → `2027-12` (`pipeline.FIXINGS`) | l'API garde l'ISO ; le front affiche `Nov-26` via `fmtFixing` |
| Dernier HICP publié | `2026-10` (`pipeline.LAST_OBS`) ; courbes au `2026-11-20` (`market_inputs.json → asof`) | `meta.last_obs`, `meta.asof` |
| Horizon `h` | `h = 1` pour `2026-11` (premier mois non publié) … `h = 14` pour `2027-12` | poids de combinaison plafonnés à `h = 12` |
| Unités | `yoy` en **%** ; `contrib_pp` en **pp** ; `bp` en **points de base de glissement annuel** ; `level_pct` en **% de niveau** | à répéter dans `meta.units` |
| Codes de sous-indice | voir §0.1 | enum `Item` |
| **Encodage** | CSV : **UTF-8**. `equations.json` et `dashboard_data.json` : **cp1252** sous Windows (écrits par `Path.write_text()` sans `encoding`, avec `ensure_ascii=False`). `backtest_summary.json`, `combo_weights.json` : ASCII. `market_inputs.json` : UTF-8 (lu en cp1252 par le moteur, sans effet sur les nombres, seuls les `_doc` sont abîmés). | lecteur JSON robuste : essai UTF-8 puis repli cp1252. Recommandation : lancer le moteur avec `$env:PYTHONUTF8=1` pour obtenir de l'UTF-8 partout, sans toucher au code. |
| Fins de ligne | JSON réécrits sous Windows en CRLF | sans effet |

### 0.1 Sous-indices (`item`) et libellés FR (`data.LABELS`)

| Code | Libellé | Niveau |
|---|---|---|
| `TOT_X_TBC` | HICP hors tabac | agrégat |
| `NRG` | Énergie | composante (top) |
| `CP0722` | Carburants | sous-poste énergie |
| `CP0453` | Fioul domestique | sous-poste énergie |
| `CP0452` | Gaz | sous-poste énergie |
| `CP0451` | Électricité | sous-poste énergie |
| `FOOD_P_X_TBC` | Alimentation transformée (hors tabac) | composante (top) |
| `FOOD_NP` | Alimentation non transformée | composante (top) |
| `IGD_NNRG` | Biens industriels hors énergie (NEIG) | composante (top) |
| `SERV` | Services | composante (top) |
| `NRG_OTHER` | Autre énergie (solide, chaleur) | poids seulement, pas de série |

Les 5 composantes « top » (qui portent `contrib_pp`) : `NRG`, `FOOD_P_X_TBC`, `FOOD_NP`, `IGD_NNRG`, `SERV`.

---

## 1. `out/forecast_headline_models.csv` — 70 lignes (5 geo × 14 fixings)

| Colonne | Type | Valeurs / sens |
|---|---|---|
| `geo` | str | EA, IT, FR, DE, ES |
| `fixing` | str | 2026-11 … 2027-12 |
| `h` | int | 1 … 14 |
| `BU` | float | glissement annuel HICPxT du modèle structurel, % |
| `STAT` | float | glissement annuel du challenger statistique, % |
| `w_BU` | float | poids du BU, `combo_weights.json[geo][min(h,12)]` |
| `COMBINE` | float | `w_BU·BU + (1−w_BU)·STAT`, % |

```
geo,fixing,h,BU,STAT,w_BU,COMBINE
EA,2026-11,1,3.905734,4.000683,0.764,3.928142
EA,2026-12,2,4.055901,4.094200,0.711,4.066970
EA,2027-01,3,4.212869,4.012406,0.628,4.138297
```

⚠ **Pas de colonne marché** : voir §11.

## 2. `out/forecast_components.csv` — 700 lignes (5 geo × 14 fixings × 10 items)

| Colonne | Type | Sens |
|---|---|---|
| `geo`, `fixing` | str | |
| `item` | str | les 10 codes de §0.1 (sans `NRG_OTHER`) |
| `yoy` | float | glissement annuel du sous-indice, %, **modèle BU** |
| `contrib_pp` | float \| vide | `poids_top × yoy` en pp ; renseigné **uniquement** pour les 5 composantes top (350 vides : `TOT_X_TBC` et les 4 sous-postes énergie) |

```
geo,fixing,item,yoy,contrib_pp
IT,2026-12,TOT_X_TBC,6.36900518764314,
IT,2026-12,NRG,35.50739878639546,3.965740695396435
IT,2026-12,CP0452,47.95086813790643,
```

Points d'attention :
- C'est du **BU seul** (pas de décomposition COMBINE ni STAT). La vue Pays doit le dire.
- La contribution est **approximative** (`Forecast.contributions` : poids × a/a). Le « résidu de chaînage » calculé par le moteur **n'est pas exporté**. Il vaut `yoy(TOT_X_TBC) − Σ contrib_pp` et va de **−12,6 à +27,0 bp** selon geo × fixing. Le pont comptable doit l'afficher comme une barre explicite.
- Pas de contribution des sous-postes énergie au total. Si besoin : `poids_top(NRG) × poids_énergie(k) × yoy(k)` (approximation, à étiqueter), avec les poids de `dashboard_data.json → weights`.

## 3. `out/forecast_scenarios.csv` — 1 260 lignes (6 scénarios × 5 geo × 3 items × 14 fixings)

| Colonne | Type | Valeurs |
|---|---|---|
| `scenario` | str | `central`, `flat`, `full`, `flat3_trend`, `brent_crack`, `brent_crack_full` |
| `geo`, `fixing` | str | |
| `item` | str | `TOT_X_TBC`, `NRG`, `CP0722` seulement |
| `yoy` | float | %, modèle BU |
| `gasoil_usd_t` | float | niveau de gasoil utilisé ce mois-là, $/t (identique pour tous les geo/items d'un scénario) |

```
scenario,geo,item,fixing,yoy,gasoil_usd_t
full,EA,CP0722,2026-11,24.30682592375306,1240.0
full,EA,CP0722,2026-12,22.206815602833196,1144.592
full,EA,CP0722,2027-01,21.1242100058308,1118.631
```

- Libellés FR : `pipeline.GASOIL_SCENARIOS` (aussi dans `dashboard_data.json → scenario_labels`).
- `flat3_trend` est **identique** à `central` (sans WOB). À afficher avec la mention ou à masquer.
- Les autres sous-indices par scénario ne sont pas exportés (calculables par `Model.forecast(scenario)` en 0,1 s).

## 4. `out/sensitivity_fixings_bp.csv` — 6 300 lignes (9 chocs × 5 geo × 10 items × 14 fixings)

| Colonne | Type | Valeurs |
|---|---|---|
| `shock` | str | `ttf_power`, `ttf_only`, `power_de`, `power_fr`, `gasoil`, `eurusd`, `food_commo`, `nonfood_commo`, `wages` |
| `label` | str | libellé FR (`sensitivity.SHOCKS[k][0]`), UTF-8 |
| `geo`, `item`, `fixing` | str | items : les 10 de §0.1 |
| `bp` | float | `(yoy_choc − yoy_central) × 100`, bp de glissement annuel, **modèle BU**, scénario central |

```
shock,label,geo,item,fixing,bp
gasoil,Gasoil ICE +10 % (en $),EA,TOT_X_TBC,2027-04,17.080322791072078
gasoil,Gasoil ICE +10 % (en $),EA,TOT_X_TBC,2027-05,17.53064644375968
gasoil,Gasoil ICE +10 % (en $),EA,TOT_X_TBC,2027-06,18.032564904950643
```

- Taille du choc : **+10 %** du niveau pour 8 chocs, **+1 pp/an** pour `wages`.
- Les chocs démarrent en **Dec-26** (premier mois après le dernier mois de `recent_months`, `2026-11`) : `bp = 0` sur Nov-26, sauf `wages`, qui démarre en **Aug-26**, après le dernier point du tracker BCE (`2026-07`), et vaut donc déjà +0,77 bp sur EA Nov-26. À signaler dans l'UI.
- Pour la COMBINE, MODELES §8 recommande de multiplier par `w_BU`.

## 5. `out/passthrough_profiles.csv` — 6 300 lignes (mêmes clés que §4)

| Colonne | Type | Sens |
|---|---|---|
| `shock`, `geo`, `item`, `fixing` | str | |
| `months` | int | 0 … 13 = rang du fixing (0 = Nov-26, mois **sans** choc ; 1 = Dec-26, premier mois choqué) |
| `level_pct` | float | variation du **niveau** de l'indice vs central, % |
| `elasticity` | float \| vide | `level_pct / 10` ; vide pour `wages` (700 lignes) |

```
shock,geo,item,fixing,months,level_pct,elasticity
ttf_power,IT,CP0452,2026-12,1,1.2066245482301952,0.12066245482301952
ttf_power,IT,CP0452,2027-01,2,2.3878855706368274,0.23878855706368274
ttf_power,IT,CP0452,2027-02,3,2.73238725836793,0.273238725836793
```

⚠ Le profil ne couvre que **0-13 mois** (borné par les 14 fixings), pas 0-24 mois comme le dit le plan (§2, vue 4). Le lien avec MODELES §11 : « n mois après le début du choc » = colonne `months` (IT gaz : 2,39 / 3,48 / 4,44 à n = 2 / 5 / 11 ✓).

## 6. `out/elasticities.csv` — 57 lignes

| Colonne | Type | Sens |
|---|---|---|
| `geo` | str | EA, IT, FR, DE, ES **et** `EA (étage 1)` (PPI zone euro) |
| `item` | str | 8 items de détail (`CP0722` … `SERV`) + `ppi_energy`, `ppi_food`, `ppi_interm` |
| `driver` | str | `gasoil_eur`, `ttf`, `power_de`, `power_fr`, `ppi_energy`, `ppi_food`, `ppi_interm`, `wage_m`, `food_commo`, `nonfood_commo` |
| `rho` | float | inertie |
| `sum_current` | float | Σ β (+ γ si régime actif) = pass-through court terme du régime actuel |
| `long_run_current` | float \| vide | `sum / (1 − ρ)` ; vide pour les drivers en niveau (`wage_m`) |
| `sum_old_regime` | float \| vide | Σ β avant 2023 ; renseigné seulement pour gaz/électricité (10 lignes) |
| `buckets` | str | `"driver[a-b]=0.123; …"`, coefficients par fenêtre (régime actuel) |
| `r2`, `sigma` | float | qualité de l'équation |
| `n` | int | nombre d'observations |

```
geo,item,driver,rho,sum_current,long_run_current,sum_old_regime,buckets,r2,sigma,n
EA,CP0722,gasoil_eur,0.0,0.307665,0.307665,,gasoil_eur[0-0]=0.207; gasoil_eur[1-1]=0.094; gasoil_eur[2-3]=0.007,0.7506,1.2013,141
EA,CP0452,ttf,0.111456,0.174191,0.196041,0.202684,ttf[0-2]=0.112; ttf[3-11]=0.055; ttf[12-23]=0.007,0.4958,1.1154,140
EA,SERV,wage_m,-0.137348,0.377006,,,wage_m[1-6]=0.377,0.8862,0.1824,123
```

## 7. `out/equations.json` — 44 clés (⚠ cp1252)

- `"{geo}/{item}"` pour 5 geo × 8 items (`CP0722`, `CP0453`, `CP0452`, `CP0451`, `FOOD_P_X_TBC`, `FOOD_NP`, `IGD_NNRG`, `SERV`) :
  ```json
  {"name": "IT gaz",
   "coef": {"m01": 1.47, …, "m11": -0.248, "rho": -0.0325,
            "ttf[0-1]": -0.0007, "ttf[0-1]×régime": 0.2524, "ttf[2-4]": 0.1025, …},
   "t":    {"m01": 1.95, …, "ttf[0-1]×régime": 6.37, …},
   "stats": {"n": 140, "sigma": 2.284, "r2": 0.397, "downweighted": 35, "sample": "2015-03..2026-10"},
   "regime_active": true, "drift": 0.15, "half_life": null}
  ```
  - `m01…m12` : effets saisonniers (%/mois). Quand `drift` est fixé (énergie), `m12` est **absent** : `s_m = drift + m_m` et `s_12 = drift − Σ m_1..11` (cf. `Equation.season`).
  - Termes de driver : `driver[a-b]` (β) et `driver[a-b]×régime` (γ, changement depuis 2023-01). `rho` est absent si l'équation n'a pas d'inertie (carburants, fioul). `easter` pour les services.
  - `half_life` : 60 (core) ou null (énergie).
- `"EA-stage1/{ppi_energy|ppi_food|ppi_interm}"` : `{name, coef, stats}` (**pas de `t`**, pas de `drift`).
- `"power_link"` : `{"power_de": 0.6821, "power_fr": 0.7705}`, élasticité contemporaine électricité de gros / TTF.
- **La formule n'est pas stockée** : le backend la reconstruit à partir des clés (`driver[a-b]` → « moyenne des Δlog driver de t−a à t−b ») selon la forme générale de MODELES §3.

## 8. `out/dashboard_data.json` (⚠ cp1252) — agrégat pour l'ancien simulateur

| Clé | Forme | Contenu |
|---|---|---|
| `asof` | str | `2026-11-20` |
| `last_obs` | str | `2026-10` |
| `fixings` | list[14] str | |
| `geos`, `geo_names`, `labels` | list / dict | libellés FR |
| `weights[geo]` | `{top:{NRG,FOOD_P_X_TBC,FOOD_NP,IGD_NNRG,SERV}, energy:{CP0722,CP0453,CP0452,CP0451,NRG_OTHER}}` | poids normalisés (somme 1) ; EA `top.NRG = 0.09212` |
| `forecast[geo][item]` | list[14] float | yoy BU (arrondi 4 déc.), 10 items |
| `stat[geo]`, `combined[geo]` | list[14] | yoy STAT et COMBINE (TOT_X_TBC) |
| `history[geo]` | `{months:[46], TOT_X_TBC:[46], …10 items}` | yoy historique **2023-01 → 2026-10 seulement** |
| `scenarios[scn][geo]` | list[14] | yoy TOT_X_TBC BU |
| `scenario_labels`, `shocks` | dict | libellés FR |
| `sens[shock][geo][item]` | list[14] | bp (= §4) |
| `profiles[shock][geo][item]` | list[14] | level_pct (= §5) |
| `elasticities` | list[57] dict | (= §6) |
| `drivers[col]` | `{months:[36], values:[36]}` | 2025-01 → 2027-12 pour `ttf`, `power_fr`, `power_de`, `gasoil_usd_t`, `gasoil_eur`, `eurusd`, `ppi_energy` (scénario central, futur inclus) |
| `combo_w[geo]` | list[14] | w_BU par fixing |
| `market_ea` | list[14] float | **fixings marché EA** (cf. §11) |
| `market_note` | str | source des fixings marché |
| `backtest` | dict | copie de `backtest_summary.json` |

Ce fichier est redondant avec les CSV. Le backend lit les CSV (source primaire) et n'en prend que `market_ea`, `drivers` et `weights`.

## 9. Backtest

### 9.1 `out/backtest_errors.csv` — 118 080 lignes, **10,1 Mo** (< 50 Mo : versionné, pas ajouté au `.gitignore`)

| Colonne | Type | Valeurs |
|---|---|---|
| `origin` | str | `2019-01` … `2025-10` (82 origines = dernier HICP connu) |
| `geo` | str | 5 geo |
| `item` | str | `TOT_X_TBC`, `NRG`, `FOOD_P_X_TBC`, `FOOD_NP`, `IGD_NNRG`, `SERV` |
| `h` | int | 1 … 12 (cible = origin + h) |
| `fc`, `act` | float | yoy prévu / réalisé, % |
| `err` | float | `fc − act`, pp |
| `model` | str | `BU`, `BU_perfect`, `STAT`, `NAIF` (pas de COMBINE ligne à ligne) |

```
origin,geo,item,h,fc,act,err,model
2019-01,EA,TOT_X_TBC,1,1.323228,1.399218,-0.075990,BU
2019-01,EA,TOT_X_TBC,2,1.291271,1.334664,-0.043393,BU
2019-01,EA,TOT_X_TBC,3,1.266418,1.664803,-0.398385,BU
```

### 9.2 `out/backtest_summary.json`

- `origins` : `"2019-01..2025-10"`, `n_origins` : 82
- `rmse[item][geo][model]` : list[12] (h1…h12), pp. Pour `TOT_X_TBC` uniquement, un modèle `COMBINE` en plus.
- `rmse_post2023[item][geo][model]` : idem, origines ≥ 2023-01, sans COMBINE.
- `bias_post2023[item][geo][model]` : erreur moyenne, pp.
- `combo_detail[geo]` : list[12] de `[w_toute_période, w_depuis_2023]` bruts.
- `combo_weights_BU[geo]["1".."12"]` : poids lissés (= `combo_weights.json`).

### 9.3 `out/combo_weights.json`

`{geo: {"1": w, …, "12": w}}`. EA : 0,764 → 0,527 ; IT : 1,0 → 0,677 ; FR/DE : 0,5 au-delà de h3 ; ES : 0,234 → 0,375.

---

## 10. Entrées (hors `out/`)

| Fichier | Format | Contenu |
|---|---|---|
| `euroinfl/data/hicp_energy_I25.csv`, `hicp_core_I25.csv` | 1re ligne `# prc_hicp_minr I25 <horodatage> months 2015-01..2026-10`, puis `geo,item,v1,…,v142` (large, sans en-tête de colonnes) | **Historique HICP en niveaux** (base 2025 = 100), 5 geo × 10 items, 2015-01 → 2026-10. Lu par `data.load_hicp()` → `{geo: DataFrame[PeriodIndex × item]}`. Énergie : `TOT_X_TBC`, `NRG`, 4 sous-postes ; core : 4 composantes. |
| `euroinfl/data/weights_2026.csv` | `year,geo,TOTAL,NRG,CP0451,CP0452,CP0453,CP0454,CP0455,CP0722,FOOD_P_X_TBC,FOOD_NP,IGD_NNRG,SERV,TOT_X_TBC` | poids Eurostat en ‰, années 2025 et 2026 ; normalisés par `data.load_weights(2026)` |
| `euroinfl/data/market_inputs.json` | voir ci-dessous | **seul fichier d'hypothèses modifiable** |
| `euroinfl/data/euro_inflation_database_long.csv` | long, 18 colonnes | identique octet pour octet à `data/raw/euro_inflation_database_long.csv` ; pivoté par `data.load_user_db()` (fréquence M uniquement) |

`market_inputs.json` :
- `asof` (`2026-11-20`), `eurusd` (1,099, tenu plat sur tout l'horizon)
- `curves.{gasoil_usd_t|ttf|brent_usd|power_fr|power_de}` : `{ "YYYY-MM": prix }` par **mois de livraison** ($/t, €/MWh, $/bbl). Convention : le niveau du mois M = contrat M+1, queue tenue plate.
- `recent_months.{2026-08..2026-11}` : `{ttf, power_fr, power_de, gasoil_usd_t, brent_usd, eurusd}`, valeurs **estimées** (la base s'arrête en 2026-07). Ce sont les « mois estimés » de la vue Inputs.
- `assumptions` : `food_commo_monthly_pct` (0), `nonfood_commo_monthly_pct` (0), `wage_growth_yoy` (null = dernier tracker BCE).
- Les clés commençant par `_` sont des commentaires.

---

## 11. Où sont les fixings marché

- **Uniquement zone euro**, **codés en dur** dans `euroinfl/run_all.py` (`dash["market_ea"] = [3.76, 3.88, 4.23, …, 2.48]`), recopiés dans `dashboard_data.json → market_ea` et dans le tableau de MODELES §1.
- Aucun fixing marché pour IT, FR, DE, ES ; aucun fichier d'entrée dédié.
- Marché EA Jan-27 = **4,23** ✓.

## 12. Moteur : signatures et chocs

```python
from euroinfl.data import load_user_db
from euroinfl.pipeline import Model
m = Model(db=load_user_db(Path("euroinfl/data/euro_inflation_database_long.csv"))).fit()   # 0,2 s
f = m.forecast(scenario="central", shocks=None, end=Period("2027-12"), X=None, H=None, last_obs=None)  # 0,12 s
f.yoy(geo, item="TOT_X_TBC") -> pd.Series[14 fixings]       # %
f.levels[geo][item]                                         # niveaux (historique + prévision)
f.components(geo), f.contributions(geo)                     # DataFrames (contributions avec « résidu de chaînage »)
m.shocked(driver, pct=10.0, scenario="central", with_power=False)
```

⚠ `Model()` sans `db` appelle `load_user_db()` qui cherche d'abord `/mnt/user-data/uploads` (chemin Linux) puis `euroinfl/data/*database_long*.csv`. Ça marche sous Windows, mais le backend doit passer `db=` explicitement, comme `run_all.py`.

STAT : `backtest.StatModel(db=db).fit(X=X)` puis `.forecast(X=X)`, avec `X, _ = pipeline.build_drivers(db, m.mkt, "central")`.

### 12.1 `shocks` = `{colonne_driver: valeur}`, appliqué dans `pipeline.build_drivers`

| Clé moteur | Type de choc | À partir de | Note |
|---|---|---|---|
| `ttf` | × multiplicateur de niveau | Dec-26 | |
| `power_de`, `power_fr` | × | Dec-26 | |
| `gasoil_usd_t` | × (sur la courbe du scénario choisi) | Dec-26 | ≠ clé de sensibilité `gasoil` |
| `brent_usd` | × | Dec-26 | n'agit que dans `brent_crack*` (le gasoil y dérive du Brent) et sur `brent_eur` (non utilisé par les équations) |
| `eurusd` | × | Dec-26 | gasoil € = $/t ÷ EURUSD : +10 % d'euro ⇒ gasoil € × 1/1,1 |
| `food_commo`, `nonfood_commo` | × | Dec-26 | |
| `wage_pp` | **+ additif** en pp/an (`wage_m += v/12`) | **Aug-26** | ≠ multiplicateur |

« Électricité entraînée par le gaz » : **ce n'est pas un argument de `forecast`**. C'est une construction de l'appelant : `Model.shocked(..., with_power=True)` et `sensitivity._shocks()` ajoutent `power_de = ttf_mult ** 0.6821` et `power_fr = ttf_mult ** 0.7705` (`m.power_link`).

### 12.2 Correspondance clés de sensibilité → `shocks`

| `shock` (CSV) | `shocks` passé au moteur |
|---|---|
| `ttf_power` | `{ttf: 1.10, power_de: 1.10**0.6821, power_fr: 1.10**0.7705}` |
| `ttf_only` | `{ttf: 1.10}` |
| `power_de` / `power_fr` | `{power_de: 1.10}` / `{power_fr: 1.10}` |
| `gasoil` | `{gasoil_usd_t: 1.10}` |
| `eurusd` | `{eurusd: 1.10}` |
| `food_commo` / `nonfood_commo` | `{food_commo: 1.10}` / `{nonfood_commo: 1.10}` |
| `wages` | `{wage_pp: 1.0}` |

### 12.3 Linéarité (test réel)

| Cas (EA sauf mention) | Exact moteur | Linéaire `x/10 × bp(+10 %)` | Log `ln(1+x)/ln(1,1) × bp` |
|---|---|---|---|
| TTF +20 % (élec. entraînée) Jun-27 | 11,45 | 11,95 | **11,43** |
| idem IT Jun-27 | 49,70 | 51,51 | **49,27** |
| Combo gasoil −20 %, TTF seul +30 %, salaires +1 pp, euro +10 %, Jan-27 | −44,0 | −40,1 | −45,9 |
| idem Jun-27 | −38,1 | −33,0 | −40,1 |
| idem Dec-27 | −1,6 | +2,7 | −1,9 |

Le modèle est linéaire en **log** des prix : l'échelle `ln(1+x)/ln(1,1)` est nettement plus proche de l'exact que `x/10`, surtout pour les gros chocs ou les chocs négatifs.

---

## 13. Chiffres témoins (plan §7), vérifiés le 22/11/2026

| Test | Attendu | Obtenu | Source | |
|---|---|---|---|---|
| COMBINE EA Nov-26 / Jan-27 / Dec-27 | 3,93 / 4,14 / 2,35 | 3,9281 / 4,1383 / 2,3537 | headline | ✓ |
| COMBINE IT Dec-26 | 6,35 | 6,3489 | headline | ✓ |
| COMBINE DE Jun-27 | 3,08 | 3,0772 | headline | ✓ |
| Marché EA Jan-27 | 4,23 | 4,23 | run_all.py / dashboard_data | ✓ |
| TTF +10 % élec. entraînée, IT Jun-27 | +25,8 bp | +25,754 | sensitivity `ttf_power` | ✓ |
| Gasoil +10 %, EA Jun-27 | +18,0 bp | +18,033 | sensitivity `gasoil` | ✓ |
| Salaires +1 pp/an, EA Dec-27 | +16,2 bp | +16,191 | sensitivity `wages` | ✓ |
| Backtest RMSE EA BU h1 / h12 | 0,36 / 2,98 | 0,36 / 2,98 | backtest_summary | ✓ |
| Poids énergie EA | 9,2 % | 9,212 % | weights | ✓ |

Contrôles complémentaires, tous conformes à MODELES : tableau §1 (70 valeurs COMBINE à 2 décimales), §9 (RMSE BU/STAT/naïf/prix parfaits des 5 pays ; EA depuis 2023 : h1 0,22, h6 BU 0,71 contre STAT 0,33), §11 (IT gaz / électricité / énergie / HICPxT), §12 (5 scénarios × 3 fixings), §10 (63 valeurs ; seuls 2 écarts d'arrondi au 0,1 : `ttf_only` EA Jan-27 = 1,55 écrit 1,5, `nonfood_commo` EA Jan-27 = 0,055 écrit 0).
