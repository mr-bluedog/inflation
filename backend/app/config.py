"""Chemins du projet (pathlib, aucun chemin absolu en dur). Surchargeables par variables d'environnement."""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(os.environ.get("INFL_ROOT", Path(__file__).resolve().parents[2]))
ENGINE_DIR = ROOT / "euroinfl"  # contient le package euroinfl/euroinfl
OUT_DIR = Path(os.environ.get("INFL_OUT_DIR", ENGINE_DIR / "out"))
ENGINE_DATA_DIR = ENGINE_DIR / "data"
RAW_DB = ROOT / "data" / "raw" / "euro_inflation_database_long.csv"
METHODOLOGY_MD = ENGINE_DIR / "MODELES.md"
MARKET_FIXINGS = ENGINE_DATA_DIR / "market_fixings.json"
MARKET_INPUTS = ENGINE_DATA_DIR / "market_inputs.json"

FRONTEND_ORIGINS = [
    o.strip()
    for o in os.environ.get("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if o.strip()
]
