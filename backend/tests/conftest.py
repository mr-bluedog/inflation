import warnings

import pytest

warnings.filterwarnings("ignore", category=DeprecationWarning)

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def get(client):
    def _get(url: str):
        r = client.get(url)
        assert r.status_code == 200, (url, r.status_code, r.text[:300])
        return r.json()

    return _get


# Les chiffres témoins (plan §7, MODELES) valent pour le millésime d'inputs de référence. Après une mise à jour
# appliquée (market data rafraîchie, fixings saisis), ces tests sont ignorés avec un message, pas en échec.
import json  # noqa: E402

from app import config  # noqa: E402

REF_ASOF = "2026-11-20"
_mi = json.loads(config.MARKET_INPUTS.read_text(encoding="utf-8"))
_mf = json.loads(config.MARKET_FIXINGS.read_text(encoding="utf-8"))
reference_inputs = pytest.mark.skipif(
    _mi.get("asof") != REF_ASOF,
    reason=f"inputs de marché au {_mi.get('asof')} (référence : {REF_ASOF}) : chiffres témoins non applicables",
)
reference_fixings = pytest.mark.skipif(
    _mf.get("asof_by_index", {}).get("EA", _mf.get("asof")) != REF_ASOF,
    reason="fixings de marché EA ressaisis : valeurs de référence non applicables",
)
