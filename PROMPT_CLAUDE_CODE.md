# Prompt de lancement pour Claude Code

Ouvrir un terminal dans le dossier `Inflation`, lancer `claude`, puis coller le bloc ci-dessous.
(`CLAUDE.md` est chargé automatiquement ; le prompt renvoie vers le plan pour le détail.)

---

```
Tu travailles sur le projet Inflation décrit dans CLAUDE.md. On va coder le dashboard web qui affiche notre modèle de prévision HICPxT (EA, IT, FR, DE, ES, fixings Nov-26 → Dec-27).

Lis d'abord, dans cet ordre, sans rien coder :
1. CLAUDE.md
2. docs/PLAN_DASHBOARD.md (le plan complet : vues, architecture, contrat d'API, phases, chiffres témoins)
3. euroinfl/MODELES.md (le modèle et les chiffres de référence)
4. docs/DATA_DICTIONARY.md et, s'il existe, docs/euro-inflation-spec.md (le site dont on s'inspire pour l'UX)
5. Le code du moteur : euroinfl/run_all.py, euroinfl/euroinfl/pipeline.py, sensitivity.py, backtest.py, data.py

Puis exécute la PHASE 0 du plan :
- Vérifie que euroinfl/ est complet ; crée un venv, installe pandas/numpy, lance `python run_all.py` et confirme qu'il tourne.
- Lance `python run_backtest.py` puis `python summarize_backtest.py` pour régénérer backtest_errors.csv.
- Pour chaque fichier de euroinfl/out/, relève les colonnes réelles, les types, les valeurs possibles des colonnes catégorielles (geo, item, shock, scenario…) et 3 lignes d'exemple. Écris tout dans docs/DATA_CONTRACT.md.
- Repère où se trouvent : l'historique HICP par pays et par sous-indice, les fixings marché, les noms exacts des clés de choc acceptées par Model.forecast(shocks=…), la gestion « électricité entraînée par le gaz ». Note-les dans DATA_CONTRACT.md.
- Vérifie les chiffres témoins du §7 du plan directement dans les sorties ; signale tout écart.
- git init, .gitignore (venv, node_modules, __pycache__, .env, out/backtest_errors.csv si > 50 Mo), premier commit.

Arrête-toi à la fin de la phase 0 et donne-moi : (a) le résumé du contrat de données, (b) les écarts éventuels sur les chiffres témoins, (c) les ajustements que tu proposes au contrat d'API du §4 compte tenu de ce que tu as trouvé. Attends ma validation avant la phase 1.

Ensuite, pour chaque phase suivante : annonce ton plan en 5 lignes, code, lance les tests, vérifie les chiffres témoins concernés, coche la phase dans docs/PLAN_DASHBOARD.md, commit, et fais-moi un point court avant de passer à la suivante.

Contraintes rappelées : ne modifie pas la logique du modèle ; le dashboard n'invente aucun chiffre ; unités explicites (%, bp, pp) ; UI en français ; backend FastAPI, frontend React + TypeScript + Vite + ECharts.
```

---

## Prompts courts pour les phases suivantes (à coller après validation)

- **Phase 1** : « Valide. Passe à la phase 1 (backend FastAPI) avec le contrat d'API ajusté. Tests pytest sur les chiffres témoins obligatoires. »
- **Phase 2-3** : « Phase 2 puis 3 : socle frontend puis vues Vue d'ensemble, Pays, Scénarios, Méthodologie. Montre-moi une capture ou l'URL locale à la fin. »
- **Phase 4** : « Phase 4 : Pass-through + explorateur d'équations. Commence par le zoom Italie gaz (MODELES §11) comme cas de test. »
- **Phase 5** : « Phase 5 : simulateur. D'abord le mode linéaire, puis /api/simulate. Affiche l'écart linéaire vs exact pour TTF +30 %. »
- **Phase 6-7** : « Phases 6 et 7 : backtest, inputs, finition, Dockerfile, déploiement Railway + Vercel, plus le mode statique. »
