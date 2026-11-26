# Modèle d'inflation zone euro (HICPxT) — explications

> Données : Eurostat HICP jusqu'à **octobre 2026** (publication du 18/11/2026), base macro fournie (jusqu'à juillet 2026), courbes ICE au **20/11/2026**, prix à la pompe du Weekly Oil Bulletin jusqu'au relevé du **16/11/2026**.
> Périmètre : zone euro (EA) + Italie, France, Allemagne, Espagne. Fixings **Nov-26 → Dec-27**.
> Tout est recalculable : `python run_all.py` (≈ 15 s). Hypothèses modifiables : `data/market_inputs.json`.

---

## 1. En une page

**Ce que fait le modèle.** Il prévoit chaque sous-indice de prix de détail **mois par mois** à partir de ses causes (prix de gros de l'énergie, prix de production, salaires), puis recompose l'inflation hors tabac de chaque pays avec les poids officiels 2026. Il ne copie aucun coefficient : tout est estimé sur 2015-2026.

**Pourquoi cette structure.** Chaque prévision peut être décomposée ("d'où viennent les 4,1 % de janvier ?") et chaque input peut être choqué ("que se passe-t-il si le gaz monte de 10 % ?"). C'est le cœur de votre demande : comprendre la transmission, pas seulement prévoir.

**Prévision centrale (combinaison BU/STAT, glissement annuel HICPxT, %)**

| Fixing | EA | IT | FR | DE | ES | EA marché* |
|---|---|---|---|---|---|---|
| Nov-26 | 3.82 | 5.87 | 3.57 | 2.43 | 4.68 | 3.76 |
| Dec-26 | 3.90 | 5.95 | 3.66 | 2.72 | 4.57 | 3.88 |
| Jan-27 | 3.98 | 6.04 | 3.86 | 2.49 | 4.50 | 4.23 |
| Feb-27 | 3.82 | 5.43 | 3.61 | 2.71 | 4.35 | 4.08 |
| Mar-27 | 3.46 | 5.23 | 3.01 | 2.28 | 3.95 | 3.64 |
| Apr-27 | 2.99 | 4.02 | 2.36 | 2.16 | 3.90 | 3.03 |
| May-27 | 3.14 | 3.93 | 2.34 | 2.53 | 4.02 | 3.21 |
| Jun-27 | 3.45 | 4.09 | 2.86 | 2.94 | 3.89 | 3.56 |
| Jul-27 | 3.07 | 3.79 | 2.31 | 2.53 | 3.18 | 3.21 |
| Aug-27 | 2.85 | 3.54 | 2.10 | 2.42 | 2.63 | 2.95 |
| Sep-27 | 2.43 | 2.70 | 1.70 | 1.95 | 2.26 | 2.36 |
| Oct-27 | 2.22 | 1.66 | 1.43 | 2.23 | 2.22 | 2.27 |
| Nov-27 | 2.28 | 1.50 | 1.58 | 2.36 | 2.28 | 2.50 |
| Dec-27 | 2.31 | 1.44 | 1.64 | 2.41 | 2.32 | 2.48 |

\* Fixings de marché HICPxT relevés le 20/11/2026 (pour comparaison uniquement, jamais utilisés par le modèle).

**Les 5 messages sur la transmission**
1. **Carburants** : le prix à la pompe est **observé** chaque semaine (Weekly Oil Bulletin de la Commission) et explique 99 % des variations mensuelles des carburants de détail en zone euro. Au-delà du dernier relevé, il suit le gros euro pour euro par litre (+ TVA) : un +10 % sur le gasoil ne fait que ≈ +3 à +4 % à la pompe, car les accises sont fixes en €/L.
2. **Gaz** : les factures ne bougent pas chaque mois. Les contrats des clients finals sont **révisés à dates fixes** : chaque trimestre en Italie, en Espagne et en zone euro (janvier, avril, juillet, octobre), une fois par an en Allemagne (janvier). À chaque révision, le prix rattrape une part de la hausse du TTF moyen depuis la révision précédente. L'Italie a en plus une part indexée chaque mois (PSV) : **0,41 du choc TTF passe en moins de 12 mois** (0,15 avant 2023), contre 0,07 à 0,13 ailleurs.
3. **Électricité** : même logique de révisions (TRVE France en février et août, contrats annuels allemands en janvier, trimestres en Italie). L'Italie est le seul grand pays où le gaz fixe fortement le prix de détail (**0,25**, car le prix de gros italien est formé par les centrales au gaz). En France (tarif réglementé) la transmission est quasi nulle.
4. **Effets indirects** (énergie → coûts de production → alimentation, biens, services) : réels mais petits et lents, de l'ordre de 0,1-0,2 % de niveau après 12 mois pour un choc de +10 % sur le gaz.
5. **Base effect** : un choc permanent sur un prix de gros augmente le glissement annuel pendant ~12 mois, puis l'effet s'efface, car le dénominateur t−12 a lui aussi été choqué.

---

## 2. Architecture

```
 MARCHÉS / HYPOTHÈSES                 ÉTAGE 1 (zone euro)            ÉTAGE 2 (par pays)                   AGRÉGATION
 ─────────────────────                ────────────────────           ───────────────────                  ──────────
 Prix à la pompe (WOB) ◄─ gasoil, Brent ÷ EURUSD ───────────────►  Carburants (CP0722)  ─┐
 Gasoil ICE ($/t) ÷ EURUSD ──┬──── (prolongement du WOB) ─────────►  Fioul (CP0453)       ─┤ Énergie (NRG)
 Gaz TTF (€/MWh) ────────────┼──── révisions à dates fixes ───────►  Gaz (CP0452)         ─┤  chaînée,      ─┐
 Électricité FR / DE ────────┼──── révisions à dates fixes ───────►  Électricité (CP0451) ─┘  poids 2026     │
                             └──► PPI énergie ──┬─► PPI alimentaire ─► Alim. transformée ──────────────────┤  HICPxT
 Matières premières alim. ──────────────────────┘                   Alim. non transformée ─────────────────┤  chaîné
 Matières premières ind. ──────► PPI biens intermédiaires ─────────► Biens hors énergie (NEIG) ─────────────┤  (déc.)
 Salaires négociés (tracker BCE) ──────────────────────────────────► Services (+ PPI énergie, Pâques) ──────┘
```

- **Direct** : prix de gros → énergie de détail (0 à 24 mois).
- **Indirect** : énergie → prix de production → alimentation, biens, services (3 à 15 mois).
- Les étages 1 sont estimés au niveau zone euro (pas de PPI par pays dans la base). Les étages 2 sont estimés **pays par pays**.

---

## 3. La brique commune : une équation par sous-indice

Toutes les équations ont **la même forme**. C'est ce qui les rend lisibles :

```
y_t  =  s_mois  +  ρ·y_{t-1}  +  Σ_b β_b · moyenne( x_{t-a} … x_{t-z} )   [+ γ_b·Régime_t·(…)]  [+ δ·Pâques_t]
```

| Symbole | Sens | Exemple |
|---|---|---|
| `y_t` | variation mensuelle du prix de détail, en % (100·Δlog) | gaz de détail italien, mois t |
| `s_mois` | effet saisonnier du mois de l'année (soldes, tarifs de janvier, tourisme d'été) | NEIG : forte baisse en janvier et juillet (soldes) |
| `ρ` | inertie : part de la variation du mois dernier qui se répète | alimentation transformée EA : 0,52 |
| `x` | variation mensuelle du driver, en % | TTF |
| fenêtre `[a-z]` | retards en mois sur lesquels on fait la moyenne | `ttf[0-1]` = ce mois et le précédent |
| `β_b` | **élasticité de la fenêtre** : une hausse unique de 1 % du driver se transmet au total de β_b % sur la fenêtre | β = 0,25 → 0,25 % en 2 mois |
| `γ_b` | **changement** de transmission depuis le régime 2023 (fin des boucliers, indexation de marché) | Italie gaz |
| Pâques | +1 en mars / −1 en avril quand Pâques tombe en mars (déplace le pic des services) | 2027 : 28 mars |

**Lire une équation en 10 secondes.**
- Pass-through total = **somme des β** (dans le régime actuel, β + γ).
- Pass-through de long terme = somme / (1 − ρ).
- La répartition entre fenêtres donne la **vitesse**.

**Estimation.**
- Moindres carrés **robustes** (Huber) : les mois exceptionnels sont automatiquement sous-pondérés (boucliers tarifaires, baisse de TVA, confinement).
- Une petite pénalité ridge stabilise les coefficients.
- Pour les composantes core, les données récentes pèsent plus (demi-vie 5 ans).
- Le terme de régime n'est activé qu'avec au moins 24 mois de données post-2023.

**Terme de révision (gaz, électricité).** Les contrats des clients finals ne sont révisés qu'à des dates fixes. Le terme vaut
`R_t = 1{mois(t) ∈ calendrier} × 100·Δlog( moyenne du prix de gros sur [t−a … t−z], depuis la révision précédente )`
et 0 entre deux révisions. Son coefficient β est la part de la hausse du gros rattrapée à chaque révision. Ces équations n'ont **pas d'inertie** (ρ) : un saut de tarif ne se propage pas au mois suivant.

**Dérive de fond de l'énergie.** Elle est fixée à 0,15 % par mois pour le gaz et l'électricité (coûts de réseau, marges), au lieu d'être estimée librement. Sinon, la moyenne historique, qui inclut 2021-22, ferait dériver la prévision vers le haut (biais de +3 pp à 12 mois constaté en backtest). Carburants et fioul : dérive nulle, toute la tendance est dans le prix à la pompe observé.

**Prévoir.** On itère l'équation mois après mois avec les drivers futurs (courbes à terme), puis on reconstruit l'indice en niveau.

---

## 4. Bloc énergie (effet direct)

**Convention de marché.** Le prix de gros du mois M est le contrat de livraison M+1 coté pendant M (front month), comme dans l'historique. Le gasoil est converti en € avec l'EUR/USD.

### 4.1 Carburants (CP0722) et fioul (CP0453) — prix à la pompe observés (Weekly Oil Bulletin)
`y = s + β_e95·Δlog Euro-super 95_t + β_gazole·Δlog gazole_t` (carburants) ; `y = s + β·Δlog fioul_t` (fioul). Pas d'inertie, dérive nulle.

Les prix à la pompe TTC sont les relevés hebdomadaires (lundi) du **Weekly Oil Bulletin** de la Commission européenne, moyennés par mois (`data/wob_weekly.csv` ; zone euro = moyenne « EUR_ » publiée par la Commission). Le **mois en cours** est la moyenne des semaines publiées : c'est un nowcast observé, pas une prévision.

| | EA | IT | FR | DE | ES |
|---|---|---|---|---|---|
| Carburants : élasticité à l'Euro-super 95 | 0.59 | 0.41 | 0.38 | 0.80 | 0.48 |
| Carburants : élasticité au gazole | 0.38 | 0.42 | 0.56 | 0.18 | 0.49 |
| R² carburants | 0.99 | 0.95 | 0.98 | 0.97 | 0.82 |
| Fioul : élasticité au fioul domestique | 0.80 | 0.71 | 0.95 | 0.61 | 0.84 |
| R² fioul | 0.93 | 0.76 | 0.93 | 0.84 | 0.86 |

La somme des élasticités des carburants est proche de 1 : l'indice de détail suit le prix à la pompe, avec un mélange essence / gazole propre à chaque pays (l'Allemagne roule surtout à l'essence, la France au gazole).

**Après le dernier relevé**, le prix à la pompe est prolongé par le prix de gros, à partir du dernier relevé hebdomadaire :
`ΔTTC (€/1 000 l) = (1 + TVA) × κ × Δ prix de gros (€/1 000 l)`.
- Gazole et fioul : κ = 1,08 et 1,04 sur le gasoil (0,845 t pour 1 000 l). Euro-super 95 : κ = 1,31 sur le Brent (6,29 bbl pour 1 000 l ; la marge de raffinage de l'essence suit le brut). κ est estimé 2010-2026 sur les prix hors taxes zone euro (retards 0-1 mois, R² 0,73 à 0,90).
- TVA : taux nationaux du bulletin ; zone euro = moyenne des 4 grands pays (20,5 %).
- Avec le scénario central (gasoil tenu 3 mois), le gazole et le fioul restent au dernier relevé pendant 3 mois (« WOB plat 3 mois »), puis suivent la courbe ICE. L'essence suit la courbe Brent.

*Pourquoi un +10 % de gasoil ne fait que ≈ +3 à +4 % à la pompe ?* Le prix TTC = (produit + marge) × (1 + TVA) + accise fixe en €/L : le produit pèse 30 à 45 % du prix TTC.

### 4.2 Gaz (CP0452) — driver TTF, révisions des contrats à dates fixes
`y = s + β_R·R_t(calendrier, moyenne du TTF sur [a-z]) [+ β·moy(Δlog TTF, t−0…t−1) + γ·D(2023)·(…)]`, sans inertie.

Le calendrier se lit dans les données : la variation mensuelle moyenne du gaz de détail est concentrée en janvier en Allemagne, en janvier / avril / juillet / octobre en Italie et en Espagne. Calendrier et fenêtre sont choisis par prévision hors échantillon (origines trimestrielles 2019-01 → 2025-10, horizons 1 à 12 mois, prix de gros réalisés, critère : erreur de glissement annuel sur les mois cibles ≥ 2023). Sur ce critère, le modèle à révisions bat l'ancienne spécification (retards glissants + inertie) sur 9 équations gaz / électricité sur 10.

| Pays | Révisions | Moyenne du TTF | β révision | Part indexée (régime actuel) | Pass-through total | Avant 2023 | Lecture |
|---|---|---|---|---|---|---|---|
| **IT** | janv., avr., juil., oct. | 1-6 mois | 0.15 | **0.26** | **0.41** | 0.15 | Révisions trimestrielles + offres indexées sur le PSV mensuel |
| EA | janv., avr., juil., oct. | 1-3 mois | 0.06 | 0.07 | 0.13 | 0.09 | Mélange des régimes nationaux |
| FR | janv., avr., juil., oct. | 1-6 mois | 0.12 | — | 0.12 | 0.12 | Prix repère CRE et offres de marché |
| ES | janv., avr., juil., oct. | 1-6 mois | 0.07 | ≈ 0 | 0.07 | 0.08 | Tarif TUR révisé chaque trimestre et plafonné |
| DE | janvier | 1-12 mois | 0.07 | — | 0.07 | 0.07 | Contrats annuels, couverture longue des Stadtwerke |

**Lecture.** Après une hausse du TTF, le gaz de détail monte surtout aux mois de révision, puis reste stable jusqu'à la révision suivante. Exemple zone euro : octobre 2026 (révision) +6,9 % sur un mois ; le modèle prévoit ≈ +0,7 % en novembre.

### 4.3 Électricité (CP0451) — driver choisi par pays, révisions des contrats à dates fixes
| Pays | Driver | Révisions | Moyenne du gros | Pass-through total | Avant 2023 | Lecture |
|---|---|---|---|---|---|---|
| **IT** | **TTF** | janv., avr., juil., oct. | 1-3 mois | **0.25** (dont 0,14 indexé chaque mois) | 0.10 | Prix de gros (PUN) fixé par les centrales gaz → le gaz pilote l'électricité de détail |
| DE | Power DE | janvier | 2-7 mois | 0.05 | 0.05 | Contrats annuels, hausses aux renouvellements |
| EA | Power DE | janv., avr., juil., oct. | 1-6 mois | 0.05 | 0.05 | |
| FR | Power FR | février, août | 1 mois | ≈ 0 | ≈ 0 | Tarif réglementé (TRVE) : le modèle ne capte que la saisonnalité des révisions |
| ES | Power DE | janvier + indexation mensuelle | 1-12 mois | 0.15 | 0.22 | Tarif PVPC lié au marché espagnol (OMIE), absent de la base → **modèle faible (R² 0,29)** |

**Lien gaz → électricité de gros.**
- Élasticité mensuelle estimée sur 2010-2026 : power DE = **0,68** × TTF, power FR = **0,77** × TTF.
- Le choc « TTF avec électricité entraînée » applique ce lien. C'est la bonne lecture d'un choc gaz durable, puisque le gaz est souvent la centrale marginale.

### 4.4 Agrégation énergie
- NRG = indice chaîné de décembre à décembre des 4 sous-postes, avec les poids 2026 du pays.
- Exemple Italie : carburants 43 %, gaz 28 %, électricité 25 %, fioul 0,5 %.
- Les autres postes (solides, chaleur, 3 à 5 %) sont supposés suivre l'énergie modélisée.
- Dans l'année en cours, l'agrégat est recalé sur l'indice publié d'octobre.

---

## 5. Étage 1 — prix de production (zone euro)

| Équation | Drivers (fenêtre) | Élasticité | ρ | R² |
|---|---|---|---|---|
| PPI énergie | gasoil€ [0-1] 0.21 · TTF [0-2] 0.09 · power DE [0-1] 0.08 | 0.38 au total | −0.13 | 0.69 |
| PPI alimentaire* | matières premières alim. [0-8] 0.027 · PPI énergie [0-5] 0.009 | LT 0.61 / 0.21 | **0.96** | 0.99 |
| PPI biens intermédiaires | PPI énergie [0-8] 0.15 · mat. prem. industrielles [0-3] 0.06 | LT 0.21 / 0.09 | 0.30 | 0.82 |

\* La base fournit le PPI alimentaire en glissement annuel. Il est converti en rythme mensuel (g.a./12) : c'est un rythme lissé, d'où ρ = 0,96. Lecture : un choc sur les matières premières se diffuse lentement mais durablement.

---

## 6. Étage 2 — alimentation, biens, services (par pays)

| Composante | Équation | EA | IT | FR | DE | ES |
|---|---|---|---|---|---|---|
| Alim. transformée | ρ · PPI alim [1-4] · PPI énergie [3-12] | ρ .52 / .14 / .05 | .23 / .29 / .07 | .38 / .26 / .04 | .20 / .29 / .07 | .34 / .25 / .04 |
| Alim. non transformée | ρ · PPI énergie [1-12] | .17 / .09 | .25 / .07 | .09 / .13 | .03 / .10 | .04 / .08 |
| Biens (NEIG) | PPI interm. [1-6] + [7-15] | 0.26 | 0.23 | 0.29 | 0.29 | 0.14 |
| Services | salaires [1-6] · PPI énergie [3-15] · Pâques | .38 / .02 | .45 / .05 | .26 / .02 | .44 / .01 | .21 / .02 |

- **Salaires.** Le coefficient porte sur le rythme mensuel des salaires négociés (g.a./12). 0,38 signifie qu'un point de hausse salariale annuelle ajoute 0,38 pp par an à l'inflation des services.
- **Hypothèse.** Le dernier point du tracker BCE (≈ 2,5 %) est prolongé. Vous pouvez le modifier dans `market_inputs.json`.
- **Exclusions de l'estimation** : 2020-03 → 2020-12 pour les biens, 2020-03 → 2021-06 pour les services (confinements).

---

## 7. Agrégation en HICPxT
`HICPxT_t / HICPxT_déc(N−1) = Σ_k w_k · I_k,t / I_k,déc(N−1)`. Les poids w sont les poids Eurostat 2026, normalisés hors tabac (EA : énergie 9,2 %, alim. transformée 12,0 %, non transformée 5,2 %, biens 25,7 %, services 47,8 %).

**Validation.** Cette formule reproduit l'indice publié d'octobre 2026 à ≤ 0,06 % près dans les 5 géographies. Le glissement annuel est toujours calculé en niveaux, sur le dénominateur t−12 exact.

---

## 8. Modèle challenger (STAT) et combinaison

- **STAT** : même chaîne d'agrégation, mais chaque sous-indice ne suit que sa saisonnalité et son inertie, sans aucun driver économique. C'est la référence « que dit l'historique seul ».
- **Combinaison** : COMBINE = w_h·BU + (1 − w_h)·STAT, avec un poids par pays et par horizon.
  - Les poids sont la moyenne des poids optimaux « 2019-2025 » et « depuis 2023 ».
  - Résultat : EA 0,93 → 0,53 (h1 → h12) ; IT 1,0 → 0,68 ; FR 0,91 → 0,5 ; DE ≈ 0,5 au-delà de 3 mois ; ES 0,79 → 0,24.
- **Les sensibilités (§10) viennent du BU** : c'est le seul modèle qui contient des causes. Pour la prévision combinée, multipliez-les par w_h.

---

## 9. Backtest (pseudo temps réel, 82 origines 2019-01 → 2025-10)

**Protocole.**
- À chaque origine, ré-estimation sur les données connues, PPI avec 2 mois de retard.
- Prix de gros futurs **figés** au dernier niveau, faute de courbes historiques : c'est le cas réaliste. On note « h1 » le premier mois non publié.
- Prix à la pompe : seuls les relevés WOB publiés au moment où sort le HICP de l'origine (semaines jusqu'au 12 du mois suivant) sont utilisés, puis prolongés par le gros figé.

**RMSE HICPxT (pp), toute la période**
| | h1 | h3 | h6 | h12 |
|---|---|---|---|---|
| EA — BU | **0.31** | **0.76** | **1.45** | **3.06** |
| EA — STAT | 0.42 | 0.93 | 1.70 | 3.29 |
| EA — naïf (g.a. inchangé) | 0.51 | 1.15 | 2.02 | 3.52 |
| EA — BU avec prix de gros parfaits | 0.29 | 0.61 | 1.16 | 2.52 |
| IT — BU / STAT | 0.54 / 0.67 | 0.96 / 1.34 | 1.64 / 2.26 | 3.47 / 4.04 |
| FR — BU / STAT | 0.30 / 0.39 | 0.65 / 0.78 | 1.16 / 1.38 | 2.39 / 2.63 |
| DE — BU / STAT | 0.52 / 0.65 | 1.09 / 1.24 | 1.73 / 1.98 | 3.26 / 3.55 |
| ES — BU / STAT | 0.55 / 0.57 | 1.09 / 1.12 | 1.82 / 1.85 | 3.24 / 3.23 |

**Apport du bloc énergie révisé (WOB + révisions à dates fixes)**, RMSE sur les mois cibles ≥ 2023, ancien → nouveau :
| | h1 | h3 | h6 | h12 |
|---|---|---|---|---|
| Énergie EA | 1.20 → **0.82** | 4.15 → **2.79** | 6.19 → **4.18** | 8.96 → **7.13** |
| HICPxT EA | 0.23 → **0.20** | 0.50 → **0.42** | 0.76 → **0.68** | 1.56 → 1.63 |

**Lecture.**
- Le BU bat les références sur toute la période, et nettement pendant le choc énergétique 2021-23.
- **Depuis 2023**, en régime calme, il reste meilleur à court terme (EA h1 0,19). Au-delà de 6 mois, STAT fait mieux sur l'agrégat (EA h6 0,33 contre 0,64). C'est en partie dû à des compensations d'erreurs, mais le BU sous-estime d'environ 0,7 pp à 12 mois la persistance post-2022 des services et des biens.
- C'est pourquoi la prévision centrale combine les deux.
- L'écart BU / BU-prix-parfaits mesure l'erreur qui vient de la prévision des prix de l'énergie : environ 0,5 pp à 12 mois sur EA.

---

## 10. Sensibilités : impact d'un choc sur les fixings

Choc **permanent** sur toute la courbe à partir de décembre 2026. Impact en **bp de glissement annuel HICPxT** (modèle BU, scénario central).

| Choc +10 % | EA Jan-27 | EA Jun-27 | EA Dec-27 | IT Jun-27 | FR Jun-27 | DE Jun-27 | ES Jun-27 |
|---|---|---|---|---|---|---|---|
| Gaz TTF (élec. de gros entraînée) | +1.9 | **+4.3** | +6.6 | **+22.0** | +2.1 | +1.5 | +7.4 |
| Gaz TTF seul | +1.7 | +3.1 | +4.1 | +21.3 | +2.0 | +1.0 | +1.3 |
| Gasoil ($) | +13.4 | **+14.5** | +4.5 | +15.8 | +19.6 | +7.8 | +21.0 |
| Euro +10 % vs $ | −24.0 | −24.6 | −3.6 | −24.0 | −24.9 | −20.1 | −30.8 |
| Électricité de gros DE | +0.3 | +1.8 | +3.7 | +0.9 | +0.7 | +0.7 | +9.0 |
| Électricité de gros FR | 0 | 0 | 0 | 0 | −0.4 | 0 | 0 |
| Mat. premières alimentaires | 0 | +0.9 | +4.5 | +1.5 | +1.5 | +1.3 | +1.4 |
| Mat. premières industrielles | +0.1 | +1.3 | +3.8 | +0.8 | +0.8 | +1.8 | +1.2 |
| Salaires +1 pp/an | +2.9 | +9.8 | +16.2 | +10.3 | +6.1 | +12.0 | +6.3 |

**Comment lire ce tableau.**
- **Linéarité** : +20 % ≈ deux fois l'effet, −10 % ≈ l'effet opposé, et les chocs s'additionnent.
- Le **gasoil** agit vite (pompe le mois même), mais seulement sur le gazole et le fioul : l'essence suit le Brent. L'**euro** agit sur les deux, d'où un effet plus fort. Ces effets en glissement annuel retombent à partir de décembre 2027 : c'est le base effect.
- Le **gaz** et l'**électricité** n'agissent qu'aux mois de révision des contrats : leur effet progresse par paliers (janvier, avril, juillet, octobre). Le gaz agit beaucoup plus en Italie ; son effet monte encore fin 2027 (révision annuelle allemande, effets indirects).
- Les **salaires** sont l'input le plus puissant à 12 mois, car les services pèsent 48 %.

---

## 11. Zoom : pass-through du gaz sur l'énergie italienne

**Question.** Le TTF monte durablement de 10 % (avec l'électricité de gros entraînée). Que deviennent les prix italiens ?

**Variation du niveau des indices (%) n mois après le début du choc (décembre 2026)**
| | 2 mois | 5 mois | 11 mois |
|---|---|---|---|
| Gaz de détail IT | +2.8 | +3.5 | **+4.0** |
| Électricité de détail IT | +1.8 | +2.5 | **+2.5** |
| Énergie IT (agrégat) | +1.3 | +1.7 | **+1.8** |
| Alimentation + biens + services IT (indirect) | ≈ 0 | +0.03 | +0.15 |
| **HICPxT Italie** | +0.17 | +0.20 | **+0.25** |
| *pour comparaison : HICPxT EA / DE / FR / ES* | +0.02 / 0 / 0 / +0.06 | +0.03 / +0.01 / +0.01 / +0.06 | +0.06 / +0.03 / +0.04 / +0.09 |

**Mécanique, étape par étape.**
1. TTF +10 % → gaz de détail : 0,26 passe en 2 mois par la part indexée chaque mois, puis 0,15 aux révisions trimestrielles (moyenne du TTF sur 6 mois). Total 0,41, soit +4,0 % après 11 mois.
2. TTF +10 % → prix de gros italien (via le gaz) → électricité de détail : 0,14 indexé chaque mois + 0,11 aux révisions trimestrielles (moyenne sur 3 mois), total 0,25. Le choc est entièrement transmis à la révision d'avril : +2,5 % dès 5 mois, puis plus rien.
3. Énergie = 28 % × gaz + 25 % × électricité + 43 % × carburants (inchangés) + … , soit **+1,8 %**.
4. HICPxT = 11,2 % (poids énergie) × 1,8 % + effets indirects, soit **+0,25 %** du niveau, c'est-à-dire **≈ +22 bp** de glissement annuel à Jun-27.

L'Italie est **4 fois plus sensible** que la zone euro au gaz. Deux raisons :
- un poids du gaz dans l'énergie (28 %) plus élevé ;
- une transmission plus rapide, à la fois sur le gaz et sur l'électricité (marché indexé, PUN fixé par le gaz).

---

## 12. Scénarios de courbe gasoil (HICPxT EA, %)

| Scénario | Règle | Dec-26 | Jun-27 | Dec-27 |
|---|---|---|---|---|
| Central | niveau actuel (1 240 $/t) tenu 3 mois, puis convergence en 6 pas vers ICE | 3.87 | 3.33 | 2.24 |
| Front constant | 1 240 $/t sur tout l'horizon | 3.87 | 3.53 | 2.61 |
| Courbe ICE complète | chaque mois au prix de son contrat | 3.77 | 3.25 | 2.28 |
| Brent + crack, gel après 3 | G = 7,443 × Brent(min(h,3)) + crack initial | 3.85 | 3.46 | 2.56 |
| Brent futures + crack | G = 7,443 × Brent(h) + crack constant | 3.85 | 3.42 | 2.47 |

L'écart entre scénarios atteint 40 bp fin 2027. La forme de la courbe compte autant que son niveau. Le scénario ne porte que sur le gasoil (gazole, fioul) : l'Euro-super 95 suit la courbe Brent dans tous les cas. (BU seul ; flat3_trend = central ici.)

---

## 13. Limites et hypothèses à vérifier (par ordre d'importance)

1. **Prix de gros août-novembre 2026 estimés.** La base s'arrête en juillet ; les valeurs proviennent des contrats échus et des cotations de marché relevés en novembre 2026 (`market_inputs.json → recent_months`). Remplacez-les par les vraies moyennes mensuelles. Les prix à la pompe, eux, sont observés (Weekly Oil Bulletin).
2. **Courbes au 20/11 reconstruites.** L'archive ICE du 4/11 est recalée sur les cotations front et queue du 20/11. Une extraction ICE complète est préférable.
3. **Mesures fiscales et réglementaires non modélisées en prévision** : niveau du TRVE France de février 2027, éventuel retour de la taxe carburant allemande, boucliers. Les mois de révision sont connus (§4.2-4.3), mais pas l'ampleur des décisions administratives au-delà de ce qu'explique le prix de gros.
4. **Calendriers de révision : approximation pour la zone euro.** La zone euro est modélisée directement ; son calendrier trimestriel mélange des pays aux calendriers différents, et les tarifs régulés hors des 4 grands pays ne sont pas modélisés un par un.
5. **Espagne électricité** : pas de prix de gros espagnol dans la base, modèle faible. **France électricité** : réglementée, quasi déconnectée du marché.
6. **Étage 1 au niveau zone euro** pour tous les pays (pas de PPI nationaux dans la base).
7. **Rupture de régime fixée à janvier 2023**, estimée sur 46 mois : les élasticités « actuelles » sont plus incertaines que les anciennes. Les t-stats sont dans `out/equations.json`.
8. Le prolongement du prix à la pompe est **linéaire en €/litre** (κ constant) : marges de distribution et cracks peuvent s'en écarter temporairement.

---

## 14. Utilisation

| Fichier | Contenu |
|---|---|
| `data/market_inputs.json` | **à modifier** : courbes, EUR/USD, mois récents, hypothèses (matières premières, salaires) ; `wob_last_week` = dernier relevé WOB du millésime |
| `data/wob_weekly.csv` | prix à la pompe hebdomadaires du Weekly Oil Bulletin (TTC, HT, TVA), rafraîchis avec la market data |
| `euroinfl/wob.py` | lecture du Weekly Oil Bulletin, moyennes mensuelles |
| `euroinfl/pipeline.py` | spécification des équations, `RESET_SPEC` (calendriers de révision), `CONFIG` (dérive énergie, demi-vie, κ pompe), construction des scénarios |
| `euroinfl/engine.py` | l'équation générique (estimation robuste, simulation, pass-through) |
| `run_all.py` | produit tous les résultats dans `out/` |
| `run_backtest.py` + `summarize_backtest.py` | backtest (≈ 3 min) et poids de combinaison |
| `out/forecast_headline_models.csv` | BU, STAT, COMBINE par pays et fixing |
| `out/forecast_components.csv` | chaque sous-indice + contributions (pp) |
| `out/sensitivity_fixings_bp.csv` | 9 chocs × 5 pays × 10 sous-indices × 14 fixings |
| `out/passthrough_profiles.csv` | profils de niveau (élasticités cumulées) |
| `out/elasticities.csv`, `out/equations.json` | tous les coefficients |

```python
from euroinfl.pipeline import Model
m = Model().fit()
base  = m.forecast("central")                       # ou "flat", "full", "brent_crack", ...
choc  = m.forecast("central", shocks={"ttf": 1.2})  # TTF +20 %
print((choc.yoy("IT") - base.yoy("IT")) * 100)      # impact en bp sur l'Italie
print(m.eq["IT"]["CP0452"].table())                 # coefficients du gaz italien
```
