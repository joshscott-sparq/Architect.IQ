"""Shared test helpers: build a TestClient authenticated as a seeded role."""

import importlib

from fastapi.testclient import TestClient

SAMPLE_CREDS = {
    "admin": ("admin@architect.iq", "admin123"),
    "user": ("user@architect.iq", "user123"),
    "client": ("client@architect.iq", "client123"),
}


def build_client(tmp_path, monkeypatch, role: str = "admin") -> TestClient:
    monkeypatch.setenv("ARCHITECTIQ_DB", str(tmp_path / "api.db"))
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    from architect_iq.api import app as app_module

    importlib.reload(app_module)
    client = TestClient(app_module.app)
    if role:
        login_as(client, role)
    return client


def login_as(client: TestClient, role: str) -> None:
    email, password = SAMPLE_CREDS[role]
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    client.headers.update({"Authorization": f"Bearer {resp.json()['token']}"})
