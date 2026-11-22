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
