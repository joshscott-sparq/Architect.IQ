"""Contract: Context Panel save + auto-recalculate, URL ingest validation."""

from conftest import build_client

BASE_PRD = "- initial requirement over databricks"


def _create(client):
    return client.post("/api/estimates", json={
        "project_name": "CtxTest", "prd_text": BASE_PRD, "client_context": {"tech_stack": ["Databricks"]},
    }).json()


def test_context_save_and_recalc(tmp_path, monkeypatch):
    c = build_client(tmp_path, monkeypatch, role="admin")
    est = _create(c)
    eid, v0 = est["estimate_id"], est["version"]

    panel = {
        "requirements": [
            {"id": "r1", "tab": "requirements", "source_type": "manual",
             "content": "- retrieval augmented generation over the corpus on databricks\n- vector store + evaluation"},
        ],
        "risks": [{"id": "k1", "tab": "risks", "source_type": "manual", "content": "Primary data owner on leave in Q3", "scope": "estimate"}],
        "accelerators": [{"id": "x1", "tab": "accelerators", "source_type": "manual", "content": "Reference implementation already exists", "scope": "estimate"}],
        "assumptions": [{"id": "a1", "tab": "assumptions", "source_type": "manual", "content": "Client provisions the infrastructure"}],
        "phases": [{"id": "p1", "name": "Discovery", "method": "relative"}],
        "external_sources": [],
    }
    r = c.put(f"/api/estimates/{eid}/context", json=panel)
    assert r.status_code == 200, r.text
    g = r.json()["graph"]

    # Panel persisted; requirements reshaped the estimate.
    assert len(g["context_panel"]["requirements"]) == 1
    assert len(g["context_panel"]["phases"]) == 1
    assert r.json()["version"] == v0  # auto-recalc saves in place (no version bump)
    # Risk became a factor; assumption recorded.
    assert any(f["family"].startswith("Risk:") for f in g["complexity_factors"])
    assert any(a.startswith("Assumption: Client provisions") for a in g["assumptions"])


def test_context_save_reapplies_pinned_work_items_on_every_recalc(tmp_path, monkeypatch):
    """D25: a document drop classifies some sentences as epic/feature/story and
    routes them straight into the estimate via panel.pinned_work_items. Unlike
    a one-shot append, this must survive a *second*, unrelated context save —
    recalculate_from_context always rebuilds work_items from scratch, so
    anything not re-sent as part of the panel would be silently discarded the
    next time any other Context Panel edit triggers this same auto-recalc."""
    c = build_client(tmp_path, monkeypatch, role="admin")
    est = _create(c)
    eid = est["estimate_id"]

    pinned_item = {
        "id": "wi-extra", "level": "feature", "epic": "Imported Doc", "feature": "Bulk CSV export",
        "points": {"realistic": 0}, "cure": {"complexity": 2, "unknowns": 2, "risks": 2, "effort": 2, "rationale": "x", "confidence": 1.0},
        "extraction_confidence": 0.8,
    }
    panel = {
        "requirements": [{"id": "r1", "tab": "requirements", "source_type": "manual", "content": "- grounded llm answers"}],
        "risks": [], "accelerators": [], "assumptions": [], "phases": [], "external_sources": [],
        "pinned_work_items": [pinned_item],
    }
    r = c.put(f"/api/estimates/{eid}/context", json=panel)
    assert r.status_code == 200, r.text
    work_items = r.json()["graph"]["work_items"]
    assert any(wi["id"] == "wi-extra" and wi["feature"] == "Bulk CSV export" for wi in work_items)

    # A second, unrelated save (e.g. editing an assumption) triggers the same
    # recalc again — the pinned item must still be there afterward.
    panel["assumptions"] = [{"id": "a1", "tab": "assumptions", "source_type": "manual", "content": "Client supplies test data"}]
    r2 = c.put(f"/api/estimates/{eid}/context", json=panel)
    assert r2.status_code == 200, r2.text
    work_items_2 = r2.json()["graph"]["work_items"]
    assert any(wi["id"] == "wi-extra" and wi["feature"] == "Bulk CSV export" for wi in work_items_2)


def test_ingest_url_rejects_non_http(client):
    assert client.post("/api/ingest/url", json={"url": "ftp://example.com"}).status_code == 422
    assert client.post("/api/ingest/url", json={"url": "notaurl"}).status_code == 422


import pytest


@pytest.fixture()
def client(tmp_path, monkeypatch):
    return build_client(tmp_path, monkeypatch, role="admin")
