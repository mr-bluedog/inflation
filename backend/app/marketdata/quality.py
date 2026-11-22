"""Origine de chaque valeur de marché hors base de données : observée, proxy, estimée, partielle.

- `observe` : moyenne de cotations réelles de l'instrument utilisé par le moteur (EUR/USD BCE, TTF et Brent front) ;
- `proxy`   : cotations réelles d'un AUTRE instrument (gasoil = ULSD × ratio ; électricité = spot au lieu du front) ;
- `estime`  : valeur saisie à la main (jeu d'inputs d'origine) ou conservée faute de donnée publique ;
- `partial` : mois en cours, moyenne sur une partie du mois seulement.

Les rafraîchissements enregistrent l'origine dans `recent_months[M]._quality` / `_partial` et `_curve_quality`.
Pour un jeu plus ancien, elle est déduite : rafraîchi (`_sources._refreshed`) → règles ci-dessous ; sinon → estimé.
Ces clés commencent par « _ » : le moteur les ignore.
"""

from __future__ import annotations

OBSERVED, PROXY, ESTIMATED = "observe", "proxy", "estime"
LABELS = {OBSERVED: "observé", PROXY: "proxy", ESTIMATED: "estimé"}

# Mois récents rafraîchis depuis les sources publiques
RECENT_RULES = {
    "eurusd": OBSERVED,
    "ttf": OBSERVED,
    "brent_usd": OBSERVED,
    "gasoil_usd_t": PROXY,
    "power_de": PROXY,
    "power_fr": PROXY,
}
# Courbes à terme après rafraîchissement
CURVE_RULES = {
    "brent_usd": "observe",  # contrats mensuels NYMEX
    "gasoil_usd_t": "proxy",  # contrats ULSD × ratio
    "ttf": "recale",  # forme précédente recalée sur le front
    "power_de": "conserve",  # courbe précédente conservée
    "power_fr": "conserve",
}
CURVE_LABELS = {
    "observe": "contrats cotés",
    "proxy": "proxy (autre instrument)",
    "recale": "forme précédente recalée sur le front",
    "conserve": "courbe précédente conservée",
    "archive": "archive ICE recalée (jeu d'origine)",
}
# Drivers dérivés : origine du moins fiable de leurs composants
DERIVED = {"gasoil_eur": ("gasoil_usd_t", "eurusd"), "brent_eur": ("brent_usd", "eurusd")}
_RANK = {OBSERVED: 0, PROXY: 1, ESTIMATED: 2}


def refreshed_on(mi: dict) -> str | None:
    return (mi.get("_sources") or {}).get("_refreshed")


def recent_quality(mi: dict) -> dict[str, dict]:
    """{mois: {"quality": {driver: origine}, "partial": bool}} pour chaque mois de recent_months."""
    refreshed = refreshed_on(mi)
    out = {}
    for m, row in mi["recent_months"].items():
        if m.startswith("_"):
            continue
        keys = [k for k in row if not k.startswith("_")]
        if "_quality" in row:
            q = {k: row["_quality"].get(k, ESTIMATED) for k in keys}
            partial = bool(row.get("_partial", False))
        elif refreshed:
            q = {k: RECENT_RULES.get(k, ESTIMATED) for k in keys}
            partial = m == refreshed[:7]
        else:
            q = {k: ESTIMATED for k in keys}
            partial = False
        out[m] = {"quality": q, "partial": partial}
    return out


def driver_quality(q: dict[str, str], key: str) -> str | None:
    """Origine d'un driver (y compris dérivé) pour un mois ; None si le driver n'est pas un prix de marché."""
    if key in DERIVED:
        parts = [q.get(p) for p in DERIVED[key] if q.get(p)]
        return max(parts, key=lambda x: _RANK[x]) if parts else None
    return q.get(key)


def curve_quality(mi: dict) -> dict[str, str]:
    if "_curve_quality" in mi:
        return dict(mi["_curve_quality"])
    if refreshed_on(mi):
        return {k: CURVE_RULES.get(k, "conserve") for k in mi["curves"]}
    return {k: "archive" for k in mi["curves"]}
