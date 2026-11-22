"""Rafraîchit la market data depuis les sources publiques (équivalent du bouton de la vue Inputs).

python refresh_market.py            # construit la proposition et affiche les écarts (n'écrit que la proposition)
python refresh_market.py --apply    # applique la proposition en attente : archive, écrit market_inputs.json,
                                    # relance run_all.py et régénère l'export statique s'il existe
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app import admin  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--apply", action="store_true", help="appliquer la proposition en attente")
    a = ap.parse_args()
    if a.apply:
        r = admin.apply_proposal(lambda: None)
        print(
            f"Appliqué : inputs au {r['asof']} ; ancien jeu archivé : {r['archived']} ; "
            f"export statique : {'oui' if r['static_exported'] else 'non'}"
        )
        return
    p = admin.refresh()
    print(f"Proposition : inputs au {p['inputs']['asof']}, ratio du proxy gasoil {p['gasoil_ratio']:.4f}")
    for w in p["warnings"]:
        print(f"  ⚠ {w}")
    changed = [r for r in p["diff"] if r["change_pct"] is None or abs(r["change_pct"]) >= 0.05]
    for r in changed:
        cp = "nouveau" if r["change_pct"] is None else f"{r['change_pct']:+.1f} %"
        print(
            f"  {r['section']:6s} {r['key']:13s} {r['period'] or '':8s} {r['current']!s:>10} -> "
            f"{r['proposed']!s:>10}  {cp}"
        )
    print(f"{len(changed)} écarts. Pour appliquer : python refresh_market.py --apply")


if __name__ == "__main__":
    main()
