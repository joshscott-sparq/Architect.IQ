"""Contract: rate-card parsing, repricing, and the rates API."""

import io

import pytest
from fastapi.testclient import TestClient

from architect_iq.core.rates import RateCard, parse_rate_file, recost
from architect_iq.models.enums import Location
from architect_iq.service import EstimateService
from architect_iq.persistence.store import SQLiteEstimateRepository
from architect_iq.models.results import ClientContext

RAG_PRD = "- retrieval augmented generation over the knowledge base on databricks\n- grounded llm answers"

ONSHORE = b"discipline,tier,location,day_rate\nAI & ML,Senior,US,2000\nData Engineering,Senior,US,1800\n"
BLENDED = b"discipline,tier,location,day_rate\nAI & ML,Senior,US,1000\nData Engineering,Senior,US,900\n"


def test_parse_csv_rates():
    rows = parse_rate_file(ONSHORE, "rates.csv")
    assert len(rows) == 2
    card = RateCard(rows)
    assert card.rate_for("AI & ML", "Senior", Location.US) == 2000
    # US fallback when the exact location is absent.
    assert card.rate_for("AI & ML", "Senior", Location.NS) == 2000


def test_parse_rejects_missing_columns():
    with pytest.raises(ValueError):
        parse_rate_file(b"foo,bar\n1,2\n", "bad.csv")


def test_parse_yaml_rates():
    y = b"rates:\n  - {discipline: Web, tier: Senior, location: US, day_rate: 1500}\n"
    rows = parse_rate_file(y, "rates.yaml")
    assert rows[0].discipline == "Web" and rows[0].day_rate == 1500


def test_recost_changes_price_not_effort(tmp_path):
    svc = EstimateService(repo=SQLiteEstimateRepository(tmp_path / "r.db"))
    svc.set_rate_card(parse_rate_file(ONSHORE, "onshore.csv"))
    stored, _ = svc.create_estimate("RAG", RAG_PRD, ClientContext(tech_stack=["Databricks"]))
    onshore_cost = stored.graph.deterministic.total_cost
    effort = stored.graph.monte_carlo.effort_points.p50
    duration = stored.graph.monte_carlo.duration_sprints.p50

    # Switch to the cheaper blended leverage card and re-cost.
    svc.set_rate_card(parse_rate_file(BLENDED, "blended.csv"))
    repriced = svc.recost_estimate(stored.estimate_id)
    assert repriced.version == 2
    # Cheaper card -> lower cost; effort and duration unchanged.
    assert repriced.graph.deterministic.total_cost < onshore_cost
    assert repriced.graph.monte_carlo.effort_points.p50 == effort
    assert repriced.graph.monte_carlo.duration_sprints.p50 == duration


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ARCHITECTIQ_DB", str(tmp_path / "api.db"))
    import importlib

    from architect_iq.api import app as app_module

    importlib.reload(app_module)
    return TestClient(app_module.app)


def test_rates_api_roundtrip(client):
    # Default card present.
    assert client.get("/api/rates").json()["source"].endswith(".yaml")

    # Upload a custom card.
    up = client.post("/api/rates", files={"file": ("onshore.csv", ONSHORE, "text/csv")})
    assert up.status_code == 200, up.text
    assert up.json()["summary"]["rows"] == 2
    assert client.get("/api/rates").json()["source"] == "custom-upload"

    # Create then re-cost.
    created = client.post("/api/estimates", json={
        "project_name": "RAG", "prd_text": RAG_PRD,
        "client_context": {"tech_stack": ["Databricks"]},
    }).json()
    rc = client.post(f"/api/estimates/{created['estimate_id']}/recost")
    assert rc.status_code == 200, rc.text
    assert rc.json()["version"] == 2
