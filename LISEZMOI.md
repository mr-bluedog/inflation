# Inflation — démarrage

## À faire avant de lancer Claude Code (2 minutes)

1. **Moteur Python** : dézipper `euroinfl_moteur_inflation.zip` (livré le 22/11, probablement dans Téléchargements) **directement dans ce dossier**. On doit obtenir `Inflation/euroinfl/run_all.py`, `Inflation/euroinfl/MODELES.md`, `Inflation/euroinfl/euroinfl/…`.
2. Ouvrir un terminal dans `Inflation/`, lancer `claude`, coller le prompt de `PROMPT_CLAUDE_CODE.md`.

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `CLAUDE.md` | Contexte permanent pour Claude Code (règles, arborescence, commandes) |
| `PROMPT_CLAUDE_CODE.md` | Prompt de lancement + prompts courts par phase |
| `docs/PLAN_DASHBOARD.md` | Plan complet du dashboard (8 vues, API, phases, chiffres témoins) |
| `docs/DATA_DICTIONARY.md` | Les 97 séries de la base CSV |
| `data/raw/euro_inflation_database_long.csv` | Base macro brute (ne pas modifier) |

Conseil : OneDrive synchronise mal `node_modules/` et `.venv/`. Si la synchro ralentit, mettre le dépôt sur GitHub et travailler dans un clone hors OneDrive (ex. `C:\dev\inflation`).
