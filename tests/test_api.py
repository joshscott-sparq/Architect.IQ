"""Contract: the FastAPI surface, end to end via TestClient."""

import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    from conftest import build_client

    return build_client(tmp_path, monkeypatch, role="admin")


RAG_PRD = "- retrieval augmented generation over the knowledge base\n- embeddings vector store databricks\n- grounded llm answers"


def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_patterns(client):
    patterns = client.get("/api/patterns").json()
    ids = {p["id"] for p in patterns}
    assert {"rag-databricks", "dotnet-modernization", "agentic-mcp"} <= ids


def test_create_get_recompute_flow(client):
    # Create
    resp = client.post("/api/estimates", json={
        "project_name": "Acme RAG",
        "prd_text": RAG_PRD,
        "client_context": {"tech_stack": ["Databricks", "Python"]},
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    eid = body["estimate_id"]
    assert body["graph"]["matched_pattern_ids"] == ["rag-databricks"]
    assert body["mermaid"].startswith("flowchart")
    baseline_cost = body["graph"]["monte_carlo"]["cost"]["p50"]

    # Get
    got = client.get(f"/api/estimates/{eid}").json()
    assert got["estimate_id"] == eid

    # Recompute with AI boost + more engineers -> new version, faster/cheaper duration
    rc = client.post(f"/api/estimates/{eid}/recompute", json={"ai_boost": 0.4, "engineer_count": 6})
    assert rc.status_code == 200, rc.text
    assert rc.json()["version"] == 2

    # List shows it
    listing = client.get("/api/estimates").json()
    assert any(item["estimate_id"] == eid for item in listing)
    assert baseline_cost >= 0


def test_create_requires_prd(client):
    resp = client.post("/api/estimates", json={"project_name": "x", "prd_text": "   "})
    assert resp.status_code == 422


def test_extract_csv(client):
    csv_bytes = b"Feature,Priority\nSearch,High\nExport,Low\n"
    resp = client.post(
        "/api/context/extract",
        files={"file": ("features.csv", csv_bytes, "text/csv")},
    )
    assert resp.status_code == 200, resp.text
    text = resp.json()["text"]
    assert "Feature | Priority" in text
    assert "Search | High" in text


def test_extract_xlsx(client):
    import io

    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Scope"
    ws.append(["Component", "Estimate"])
    ws.append(["Ingestion", 13])
    ws.append([None, None])  # blank row skipped
    buf = io.BytesIO()
    wb.save(buf)

    resp = client.post(
        "/api/context/extract",
        files={"file": ("scope.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert resp.status_code == 200, resp.text
    text = resp.json()["text"]
    assert "## Sheet: Scope" in text
    assert "Component | Estimate" in text
    assert "Ingestion | 13" in text
