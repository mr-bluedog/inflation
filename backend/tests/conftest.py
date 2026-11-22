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
from pathlib import Path  # noqa: E402

from app import config  # noqa: E402

REF_ASOF = "2026-11-20"
_FIX = Path(__file__).parent / "fixtures"
_mi = json.loads(config.MARKET_INPUTS.read_text(encoding="utf-8"))
_mf = json.loads(config.MARKET_FIXINGS.read_text(encoding="utf-8"))
# millésime de référence = CONTENU identique aux inputs figés (la date seule ne suffit pas : un rafraîchissement
# le jour même porte la même date avec d'autres prix)
_ref_mi = json.loads((_FIX / "market_inputs_20261120.json").read_text(encoding="utf-8"))
_ref_mf = json.loads((_FIX / "market_fixings_20261120.json").read_text(encoding="utf-8"))
reference_inputs = pytest.mark.skipif(
    _mi != _ref_mi,
    reason="inputs de marché différents du millésime de référence du 20/11/2026 : chiffres témoins non applicables",
)
reference_fixings = pytest.mark.skipif(
    _mf.get("fixings", {}).get("EA") != _ref_mf["fixings"]["EA"],
    reason="fixings de marché EA ressaisis : valeurs de référence non applicables",
)
