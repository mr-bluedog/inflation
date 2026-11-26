"""Mode statique (plan §3) : écrit les réponses JSON de toutes les routes GET dans frontend/public/data/.

Les fichiers sont produits en appelant l'API elle-même (TestClient) : leur contenu est identique, octet pour octet
une fois parsé, à celui du mode API. Arborescence = chemin de la route, paramètres en sous-dossiers :
    /api/headline?geo=EA                -> headline/EA.json
    /api/history?geo=EA&item=SERV       -> history/EA/SERV.json      (depuis 2015-01)
    /api/passthrough?geo=IT&item=CP0452 -> passthrough/IT/CP0452.json (tous les chocs)
    /api/equations/IT/CP0452            -> equations/IT/CP0452.json
    /api/backtest/errors?geo=EA         -> backtest/errors/EA.json    (TOT_X_TBC, tous h et modèles)
    /api/inputs/series/{code}           -> inputs/series/{code}.json
Un manifest.json récapitule run_id, date et liste des fichiers.

Usage : python export_static.py [--out ../frontend/public/data]
"""

from __future__ import annotations

import argparse
import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", category=DeprecationWarning)
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient  # noqa: E402

from app import catalog as C  # noqa: E402
from app.config import ROOT  # noqa: E402
from app.main import app  # noqa: E402

DEFAULT_OUT = ROOT / "frontend" / "public" / "data"


def targets(client: TestClient) -> list[tuple[str, str]]:
    t = [
        ("/api/meta", "meta.json"),
        ("/api/elasticities", "elasticities.json"),
        ("/api/equations", "equations/index.json"),
        ("/api/backtest", "backtest.json"),
        ("/api/inputs/market", "inputs/market.json"),
        ("/api/market/paths", "market/paths.json"),
        ("/api/inputs/series", "inputs/series.json"),
        ("/api/inputs/fixings", "inputs/fixings.json"),
        ("/api/methodology", "methodology.json"),
    ]
    for g in C.GEOS:
        t += [
            (f"/api/headline?geo={g}", f"headline/{g}.json"),
            (f"/api/components?geo={g}", f"components/{g}.json"),
            (f"/api/sensitivities?geo={g}", f"sensitivities/{g}.json"),
            (f"/api/scenarios?geo={g}", f"scenarios/{g}.json"),
            (f"/api/backtest/errors?geo={g}&item=TOT_X_TBC", f"backtest/errors/{g}.json"),
        ]
        for it in C.ALL_ITEMS:
            t.append((f"/api/history?geo={g}&item={it}&from=2015-01", f"history/{g}/{it}.json"))
            t.append((f"/api/passthrough?geo={g}&item={it}", f"passthrough/{g}/{it}.json"))
    for e in client.get("/api/equations").json()["data"]["equations"]:
        t.append((f"/api/equations/{e['geo']}/{e['item']}", f"equations/{e['geo']}/{e['item']}.json"))
    for s in client.get("/api/inputs/series").json()["data"]:
        t.append((f"/api/inputs/series/{s['code']}", f"inputs/series/{s['code']}.json"))
    return t


def export(out: Path) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    files, total = [], 0
    with TestClient(app) as client:
        run_id = client.get("/api/health").json()["run_id"]
        for url, rel in targets(client):
            r = client.get(url)
            r.raise_for_status()
            p = out / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            txt = json.dumps(r.json(), ensure_ascii=False, separators=(",", ":"))
            p.write_text(txt, encoding="utf-8")
            files.append({"route": url, "file": rel})
            total += len(txt.encode("utf-8"))
        meta = client.get("/api/meta").json()["meta"]
    manifest = {
        "mode": "static",
        "run_id": run_id,
        "asof": meta["asof"],
        "last_obs": meta["last_obs"],
        "n_files": len(files),
        "bytes": total,
        "files": files,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    return manifest


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    a = ap.parse_args()
    m = export(a.out)
    print(f"{m['n_files']} fichiers, {m['bytes'] / 1e6:.1f} Mo -> {a.out} (run_id {m['run_id']})")


if __name__ == "__main__":
    main()
