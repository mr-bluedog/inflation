"""Weekly Oil Bulletin (Commission européenne) : prix à la pompe hebdomadaires, avec et hors taxes.

Source : « Weekly Oil Bulletin – Prices history » (energy.ec.europa.eu), fichier xlsx public,
feuilles « Prices with taxes » / « Prices wo taxes » / « VAT », en EUR pour 1 000 litres,
un relevé par lundi depuis 2005. Zone euro = colonnes « EUR_ » (moyenne pondérée Commission).

Le moteur utilise les moyennes MENSUELLES des relevés hebdomadaires :
  - carburants (CP0722)  ← Euro-super 95 et gazole routier, prix TTC ;
  - fioul domestique (CP0453) ← gazole de chauffage, prix TTC.
Le mois en cours est une moyenne partielle des semaines déjà publiées.
Au-delà du dernier relevé, le prix à la pompe est prolongé par le prix de gros (pipeline.build_drivers) :
  ΔTTC = (1 + TVA) × κ × Δ(prix de gros en EUR / 1 000 l)
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from .data import DATA, GEOS

WOB_FILE = DATA / "wob_weekly.csv"
PRODUCTS = {"euro95": "e95", "diesel": "dsl", "heating_oil": "heat"}
COUNTRY_PREFIX = {"EA": "EUR", "FR": "FR", "DE": "DE", "IT": "IT", "ES": "ES"}
# Conversion des prix de gros en EUR / 1 000 l : gazole 0,845 t / 1 000 l ; Brent 1 000 l = 6,2898 bbl.
GASOIL_T_PER_KL = 0.845
BRENT_BBL_PER_KL = 6.2898


def _sheet(xl: pd.ExcelFile, name: str) -> pd.DataFrame:
    d = pd.read_excel(xl, name, header=None)
    cols = [str(c) for c in d.iloc[0]]
    d = d.iloc[3:].copy()
    d.columns = cols
    dates = pd.to_datetime(d[cols[0]], errors="coerce")
    d = d[dates.notna()]
    d.index = pd.DatetimeIndex(dates[dates.notna()], name="date")
    return d


def _vat(xl: pd.ExcelFile) -> dict[str, float]:
    """Taux de TVA en vigueur (dernière ligne par pays) sur l'Euro-super 95, en %."""
    v = pd.read_excel(xl, "VAT", header=None)
    out: dict[str, float] = {}
    for _, r in v.iloc[4:].iterrows():
        code = str(r[0]).rstrip("_")
        if code and code != "nan" and pd.notna(r[2]):
            out[code] = float(r[2])     # les lignes sont chronologiques : la dernière gagne
    return out


def parse_history(path: str | Path) -> tuple[pd.DataFrame, dict[str, float]]:
    """xlsx officiel → table longue (date, geo, product, ttc, ht) + TVA par zone (%)."""
    xl = pd.ExcelFile(path)
    ttc, ht = _sheet(xl, "Prices with taxes"), _sheet(xl, "Prices wo taxes")
    vat = _vat(xl)
    rows = []
    for g, p in COUNTRY_PREFIX.items():
        for prod in PRODUCTS:
            a = pd.to_numeric(ttc.get(f"{p}_price_with_tax_{prod}"), errors="coerce")
            b = pd.to_numeric(ht.get(f"{p}_price_wo_tax_{prod}"), errors="coerce").reindex(a.index)
            df = pd.DataFrame({"date": a.index, "geo": g, "product": prod, "ttc": a.values, "ht": b.values})
            rows.append(df.dropna(subset=["ttc"]))
    out = pd.concat(rows).sort_values(["geo", "product", "date"]).reset_index(drop=True)
    vat_geo = {g: vat[p] for g, p in COUNTRY_PREFIX.items() if g != "EA"}
    # zone euro : pas de taux unique ; moyenne des 4 grands pays (approximation documentée)
    vat_geo["EA"] = float(np.mean([vat_geo[g] for g in ("FR", "DE", "IT", "ES")]))
    return out, vat_geo


def save(weekly: pd.DataFrame, vat: dict[str, float], path: Path = WOB_FILE) -> None:
    w = weekly.copy()
    w["date"] = pd.to_datetime(w["date"]).dt.strftime("%Y-%m-%d")
    header = "# vat_pct " + " ".join(f"{g}={vat[g]:.2f}" for g in GEOS) + "\n"
    path.write_text(header + w.to_csv(index=False, float_format="%.4f", lineterminator="\n"), encoding="utf-8")


def load(path: Path = WOB_FILE) -> tuple[pd.DataFrame, dict[str, float]]:
    """(table hebdomadaire, TVA %) ; table vide si le fichier n'existe pas."""
    if not path.exists():
        return pd.DataFrame(columns=["date", "geo", "product", "ttc", "ht"]), {}
    first = path.read_text(encoding="utf-8").splitlines()[0]
    vat = {k: float(v) for k, v in (t.split("=") for t in first.removeprefix("# vat_pct ").split())}
    w = pd.read_csv(path, comment="#", parse_dates=["date"])
    return w, vat


def monthly(weekly: pd.DataFrame, cutoff: pd.Timestamp | None = None) -> pd.DataFrame:
    """Moyennes mensuelles TTC, colonnes « wob_<e95|dsl|heat>_<geo> » (EUR / 1 000 l).
    cutoff : n'utiliser que les relevés publiés jusqu'à cette date (backtest pseudo temps réel)."""
    w = weekly if cutoff is None else weekly[weekly["date"] <= cutoff]
    if w.empty:
        return pd.DataFrame()
    w = w.assign(col="wob_" + w["product"].map(PRODUCTS) + "_" + w["geo"], month=w["date"].dt.to_period("M"))
    return w.pivot_table(index="month", columns="col", values="ttc", aggfunc="mean").sort_index()


def last_week(weekly: pd.DataFrame, cutoff: pd.Timestamp | None = None) -> tuple[pd.Timestamp | None, dict[str, float]]:
    """Date et prix TTC du dernier relevé : {« wob_e95_EA »: 1857.3, …}."""
    w = weekly if cutoff is None else weekly[weekly["date"] <= cutoff]
    if w.empty:
        return None, {}
    d = w["date"].max()
    x = w[w["date"] == d]
    return d, {f"wob_{PRODUCTS[p]}_{g}": float(v) for g, p, v in zip(x["geo"], x["product"], x["ttc"])}
