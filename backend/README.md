# Backend — API FastAPI du dashboard HICPxT

Sert les sorties du moteur (`euroinfl/out/*`) et ses entrées ; `POST /api/simulate` appelle le moteur pour le recalcul exact des chocs. Contrat : `docs/PLAN_DASHBOARD.md` §4 et §4.1, schémas détaillés dans `docs/DATA_CONTRACT.md`.

```powershell
# depuis la racine du dépôt
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000   # doc : http://localhost:8000/docs
..\.venv\Scripts\python.exe -m pytest -q                                   # chiffres témoins + contrat
..\.venv\Scripts\python.exe export_static.py                               # mode statique -> frontend/public/data/
```

| Module | Rôle |
|---|---|
| `app/config.py` | chemins (pathlib, surchargeables : `INFL_ROOT`, `INFL_OUT_DIR`, `FRONTEND_ORIGINS`) |
| `app/catalog.py` | import du moteur, libellés, chocs, curseurs du simulateur, unités |
| `app/store.py` | chargement unique au démarrage (lecteur JSON UTF-8 / cp1252) |
| `app/equations.py` | formule et table des termes de chaque équation |
| `app/schemas.py` | schémas pydantic v2, enveloppe `{meta, data}` |
| `app/main.py` | routes |

Après un `run_all.py`, redémarrer l'API (et relancer `export_static.py` pour le mode statique).

Dépendances : `requirements.txt` (exécution, image Docker) et `requirements-dev.txt` (tests et qualité).
Déploiement : `backend/Dockerfile` (contexte = racine du dépôt) et `railway.json` ; voir le README racine.
