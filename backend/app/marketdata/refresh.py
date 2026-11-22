"""Construction d'un NOUVEAU jeu d'inputs de marché (même schéma que euroinfl/data/market_inputs.json).

Conventions du moteur (DATA_CONTRACT §10) respectées :
- `recent_months[M]` = niveau du mois M = moyenne, pendant M, du contrat front (livraison M+1) ;
- `curves[k][D]` = prix du contrat de livraison D ; le moteur prend pour le mois M le contrat M+1.

Règles par input (choix validés le 22/11/2026, en attendant Bloomberg) :
- EUR/USD : moyenne mensuelle du taux BCE ; valeur plate = dernier fixing BCE ;
- TTF : moyennes mensuelles du front NYMEX (TTF=F). Courbe : seules quelques échéances sont cotées sur la
  source publique, la forme de la courbe en place est donc conservée et recalée sur le front du jour ;
- Brent : moyennes du front (BZ=F) ; courbe = contrats mensuels NYMEX (BZF27…) ;
- Gasoil : PROXY. Le gasoil ICE n'est pas public : on prend l'ULSD NYMEX (HO, $/gal × 42 × 7,443 = $/t)
  multiplié par un ratio ICE / ULSD calibré sur les 12 derniers mois où l'ICE est connu (base de données) ;
- Électricité DE, FR : moyennes mensuelles du day-ahead (proxy du contrat front, non public) ; la courbe à terme
  en place est CONSERVÉE (le spot est trop volatil pour la remplacer : +52 % vs front observé en nov. 2026).
Le mois en cours est une moyenne partielle (signalée). Les hypothèses hors marché ne sont pas modifiées.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Protocol

import pandas as pd

from . import sources as SRC

GAL_PER_BBL = 42.0
BBL_PER_T = 7.443  # même facteur que le moteur (data.wholesale_history)
CURVE_END = pd.Period("2028-01", "M")
RATIO_WINDOW = 12  # mois de calibration du proxy gasoil
STALE_DAYS = 10  # une échéance sans cotation depuis plus longtemps est écartée
UNITS = {
    "ttf": "€/MWh",
    "power_de": "€/MWh",
    "power_fr": "€/MWh",
    "gasoil_usd_t": "$/t",
    "brent_usd": "$/bbl",
    "eurusd": "$ pour 1 €",
}
LABELS = {
    "ttf": "Gaz TTF",
    "power_de": "Électricité de gros DE",
    "power_fr": "Électricité de gros FR",
    "gasoil_usd_t": "Gasoil",
    "brent_usd": "Brent",
    "eurusd": "EUR/USD",
}


class Fetcher(Protocol):
    def eurusd(self, start: date) -> pd.Series: ...
    def daily(self, symbol: str, start: date) -> pd.Series: ...
    def power(self, bzn: str, start: date, end: date) -> pd.Series: ...


class PublicFetcher:
    """Sources publiques réelles (réseau)."""

    def eurusd(self, start):
        return SRC.ecb_eurusd(start)

    def daily(self, symbol, start):
        return SRC.yahoo_daily(symbol, start)

    def power(self, bzn, start, end):
        return SRC.energy_charts_daily(bzn, start, end)


@dataclass
class Proposal:
    inputs: dict
    sources: dict[str, str]
    warnings: list[str] = field(default_factory=list)
    gasoil_ratio: float | None = None


def _monthly_mean(s: pd.Series) -> pd.Series:
    return s.groupby(s.index.to_period("M")).mean()


def _ulsd_usd_t(s: pd.Series) -> pd.Series:
    return s * GAL_PER_BBL * BBL_PER_T


def gasoil_ratio(ice_monthly: pd.Series, ulsd_monthly: pd.Series, window: int = RATIO_WINDOW) -> float:
    """Ratio moyen ICE / ULSD (tous deux en $/t, moyennes mensuelles du front) sur les derniers mois communs."""
    common = pd.concat([ice_monthly, ulsd_monthly], axis=1, join="inner").dropna().tail(window)
    if len(common) < 3:
        raise SRC.SourceError("proxy gasoil : moins de 3 mois communs ICE / ULSD pour calibrer le ratio")
    return float((common.iloc[:, 0] / common.iloc[:, 1]).mean())


def build_proposal(current: dict, ice_gasoil_monthly: pd.Series, today: date, fetch: Fetcher) -> Proposal:
    """current : market_inputs.json actuel ; ice_gasoil_monthly : gasoil ICE historique en $/t (PeriodIndex)."""
    new = copy.deepcopy(current)
    warn: list[str] = []
    this_month = pd.Period(today, "M")
    recent_keys = sorted(k for k in current["recent_months"] if not k.startswith("_"))
    first = pd.Period(recent_keys[0], "M") if recent_keys else this_month
    months = pd.period_range(first, this_month, freq="M")
    hist_start = (first - RATIO_WINDOW - 1).to_timestamp().date()
    start = first.to_timestamp().date()

    # --- séries quotidiennes
    eur = fetch.eurusd(start)
    ttf = fetch.daily("TTF=F", start)
    brent = fetch.daily("BZ=F", start)
    ulsd = _ulsd_usd_t(fetch.daily("HO=F", hist_start))
    p_de = fetch.power("DE-LU", start, today)
    p_fr = fetch.power("FR", start, today)

    ratio = gasoil_ratio(ice_gasoil_monthly, _monthly_mean(ulsd))
    gasoil = ulsd * ratio
    monthly = {
        "ttf": _monthly_mean(ttf),
        "power_de": _monthly_mean(p_de),
        "power_fr": _monthly_mean(p_fr),
        "gasoil_usd_t": _monthly_mean(gasoil),
        "brent_usd": _monthly_mean(brent),
        "eurusd": _monthly_mean(eur),
    }
    rounding = {"eurusd": 4}
    recent: dict = {"_doc": ""}
    for m in months:
        row = {}
        for k, s in monthly.items():
            if m in s.index:
                row[k] = round(float(s[m]), rounding.get(k, 2))
            else:  # pas de donnée publique pour ce mois : on garde la valeur en place
                old = current["recent_months"].get(str(m), {}).get(k)
                if old is not None:
                    row[k] = old
                    warn.append(f"{LABELS[k]} {m} : pas de donnée publique, valeur précédente conservée")
        if row:
            recent[str(m)] = row
    days = int((eur.index.to_period("M") == this_month).sum())
    if str(this_month) in recent:
        warn.append(f"{this_month} : moyenne partielle du mois en cours ({days} jours de cotation BCE)")
    recent["_doc"] = (
        f"Moyennes mensuelles du contrat front, rafraîchies le {today.isoformat()} depuis des sources publiques : "
        "TTF et Brent NYMEX (Yahoo Finance), EUR/USD BCE, électricité day-ahead Energy-Charts (proxy du front), "
        f"gasoil = proxy ULSD NYMEX × {ratio:.4f} (ratio ICE/ULSD sur {RATIO_WINDOW} mois). "
        "Le mois en cours est partiel."
    )
    new["recent_months"] = recent

    # --- courbes (mois de livraison)
    deliveries = pd.period_range(this_month + 1, CURVE_END, freq="M")
    curves = new["curves"]
    brent_curve, gasoil_curve = {}, {}
    recent_from = today - timedelta(days=STALE_DAYS)
    for d in deliveries:
        for root, out, conv in (
            ("BZ", brent_curve, 1.0),
            ("HO", gasoil_curve, GAL_PER_BBL * BBL_PER_T * ratio),
        ):
            try:
                s = fetch.daily(SRC.contract_symbol(root, d), recent_from)
            except SRC.SourceError:
                continue
            if s.index.max().date() < recent_from:  # cotation périmée (contrat peu liquide) : écartée
                continue
            out[str(d)] = round(float(s.iloc[-1]) * conv, 2)
    for k, c in (("brent_usd", brent_curve), ("gasoil_usd_t", gasoil_curve)):
        if len(c) >= 3:
            curves[k] = c
        else:
            warn.append(f"{LABELS[k]} : courbe publique incomplète, courbe précédente conservée")

    # TTF : forme de la courbe en place, recalée sur le front du jour
    old_ttf = {pd.Period(k, "M"): v for k, v in current["curves"]["ttf"].items()}
    front_d = this_month + 1
    anchor = old_ttf.get(front_d) or old_ttf[min(old_ttf)]
    k_ttf = float(ttf.iloc[-1]) / anchor
    curves["ttf"] = {str(d): round(old_ttf.get(d, old_ttf[max(old_ttf)]) * k_ttf, 3) for d in deliveries}
    warn.append(
        f"TTF : forme de la courbe précédente recalée sur le front du jour (× {k_ttf:.3f}) ; "
        "les échéances mensuelles ne sont pas toutes cotées sur la source publique"
    )
    # Électricité : pas de contrats à terme publics. Le day-ahead (spot) est trop volatil pour servir de courbe :
    # la courbe en place est conservée ; seules les moyennes mensuelles réalisées sont rafraîchies (proxy spot).
    warn.append(
        "Électricité DE/FR : courbe à terme précédente conservée (contrats à terme non publics) ; "
        "mois récents = moyenne day-ahead (spot), proxy imparfait du contrat front"
    )
    warn.append(f"Gasoil : proxy ULSD NYMEX × {ratio:.4f} (gasoil ICE non public)")

    new["eurusd"] = round(float(eur.iloc[-1]), 4)
    new["asof"] = max(s.index.max() for s in (eur, ttf, brent)).date().isoformat()
    new["_curve_method"] = (
        f"Rafraîchi le {today.isoformat()} depuis des sources publiques (voir _sources). Brent et gasoil : "
        "contrats mensuels NYMEX (gasoil = proxy ULSD recalé) ; TTF : courbe précédente recalée sur le front ; "
        "électricité : courbe précédente conservée. À remplacer par Bloomberg."
    )
    srcs = {
        "eurusd": SRC.SOURCES["ecb"],
        "ttf": SRC.SOURCES["yahoo"] + " — TTF=F (front) ; courbe recalée",
        "brent_usd": SRC.SOURCES["yahoo"] + " — BZ=F et contrats BZ",
        "gasoil_usd_t": SRC.SOURCES["yahoo"] + f" — PROXY ULSD (HO) × {ratio:.4f}",
        "power_de": SRC.SOURCES["energy_charts"] + " — zone DE-LU",
        "power_fr": SRC.SOURCES["energy_charts"] + " — zone FR",
    }
    new["_sources"] = {**srcs, "_refreshed": today.isoformat()}
    return Proposal(inputs=new, sources=srcs, warnings=warn, gasoil_ratio=ratio)


def diff(current: dict, proposed: dict) -> list[dict]:
    """Écarts ligne à ligne entre deux jeux d'inputs (valeurs scalaires, mois récents, courbes)."""
    rows = []

    def add(section, key, period, a, b):
        if a is None and b is None:
            return
        chg = None if (a in (None, 0) or b is None) else (b / a - 1) * 100
        rows.append(
            {
                "section": section,
                "key": key,
                "label": LABELS.get(key, key),
                "unit": UNITS.get(key, ""),
                "period": period,
                "current": a,
                "proposed": b,
                "change_pct": chg,
            }
        )

    add("scalar", "eurusd", None, current.get("eurusd"), proposed.get("eurusd"))
    months = sorted(
        {m for d in (current["recent_months"], proposed["recent_months"]) for m in d if not m.startswith("_")}
    )
    for m in months:
        a, b = current["recent_months"].get(m, {}), proposed["recent_months"].get(m, {})
        for k in UNITS:
            add("recent", k, m, a.get(k), b.get(k))
    for k in proposed["curves"]:
        a, b = current["curves"].get(k, {}), proposed["curves"][k]
        for d in sorted(set(a) | set(b)):
            add("curve", k, d, a.get(d), b.get(d))
    return rows
