"""Connecteurs vers des sources PUBLIQUES et gratuites (sans clé), en attendant Bloomberg.

| Donnée | Source | Remarque |
|---|---|---|
| EUR/USD | BCE, taux de référence quotidien (data-api.ecb.europa.eu) | officiel |
| TTF, Brent, ULSD | Yahoo Finance (contrats NYMEX : front continu et échéances) | API non officielle, peut changer |
| Électricité DE, FR | Energy-Charts (Fraunhofer ISE), day-ahead | licence CC BY 4.0 (Bundesnetzagentur / SMARD) |

Chaque connecteur renvoie une série quotidienne pandas (index = date). Aucune donnée utilisateur n'est envoyée.
"""

from __future__ import annotations

import csv
import io
import json
import urllib.parse
import urllib.request
from datetime import UTC, date, datetime

import pandas as pd

USER_AGENT = "Mozilla/5.0 (compatible; inflation-dashboard/1.0)"
TIMEOUT = 25
MONTH_CODES = "FGHJKMNQUVXZ"  # code d'échéance des contrats à terme (janvier → décembre)

SOURCES = {
    "ecb": "BCE, taux de référence EUR/USD (data-api.ecb.europa.eu)",
    "yahoo": "Yahoo Finance, contrats NYMEX (non officiel)",
    "energy_charts": "Energy-Charts (Fraunhofer ISE), day-ahead, CC BY 4.0, données Bundesnetzagentur / SMARD.de",
}


class SourceError(RuntimeError):
    pass


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:  # noqa: S310 (URL construites ici)
            return r.read()
    except Exception as e:  # réseau, HTTP, délai
        raise SourceError(f"{url.split('?')[0]} : {e}") from e


def ecb_eurusd(start: date) -> pd.Series:
    """Taux de référence BCE (USD pour 1 EUR), quotidien."""
    url = (
        "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A"
        f"?startPeriod={start.isoformat()}&format=csvdata"
    )
    rows = list(csv.DictReader(io.StringIO(_get(url).decode("utf-8"))))
    s = pd.Series({pd.Timestamp(r["TIME_PERIOD"]): float(r["OBS_VALUE"]) for r in rows if r.get("OBS_VALUE")})
    if s.empty:
        raise SourceError("BCE : aucune observation EUR/USD")
    return s.sort_index()


def yahoo_daily(symbol: str, start: date) -> pd.Series:
    """Cours de clôture quotidiens d'un symbole Yahoo Finance (ex. 'TTF=F', 'BZF27.NYM')."""
    p1 = int(datetime(start.year, start.month, start.day, tzinfo=UTC).timestamp())
    p2 = int(datetime.now(UTC).timestamp())
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}"
        f"?period1={p1}&period2={p2}&interval=1d"
    )
    j = json.loads(_get(url).decode("utf-8"))
    res = (j.get("chart") or {}).get("result") or []
    if not res:
        err = ((j.get("chart") or {}).get("error") or {}).get("description", "pas de données")
        raise SourceError(f"Yahoo {symbol} : {err}")
    ts = res[0].get("timestamp") or []
    close = ((res[0].get("indicators") or {}).get("quote") or [{}])[0].get("close") or []
    s = pd.Series(
        {pd.Timestamp(t, unit="s").normalize(): c for t, c in zip(ts, close, strict=False) if c is not None}
    )
    if s.empty:
        raise SourceError(f"Yahoo {symbol} : série vide")
    return s[~s.index.duplicated(keep="last")].sort_index()


def contract_symbol(root: str, delivery: pd.Period) -> str:
    """Contrat NYMEX d'une échéance de livraison : ('BZ', 2027-01) → 'BZF27.NYM'."""
    return f"{root}{MONTH_CODES[delivery.month - 1]}{str(delivery.year)[2:]}.NYM"


def energy_charts_daily(bzn: str, start: date, end: date) -> pd.Series:
    """Prix day-ahead (€/MWh) d'une zone (DE-LU, FR), moyenne par jour."""
    url = f"https://api.energy-charts.info/price?bzn={bzn}&start={start.isoformat()}&end={end.isoformat()}"
    j = json.loads(_get(url).decode("utf-8"))
    secs, prices = j.get("unix_seconds") or [], j.get("price") or []
    s = pd.Series(
        [p for p in prices], index=pd.to_datetime(secs, unit="s", utc=True).tz_convert("Europe/Berlin")
    ).dropna()
    if s.empty:
        raise SourceError(f"Energy-Charts {bzn} : série vide")
    s.index = s.index.tz_localize(None).normalize()
    return s.groupby(level=0).mean()
