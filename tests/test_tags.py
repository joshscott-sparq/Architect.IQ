"""Contract: estimate tags/metadata."""

from conftest import build_client

RAG_PRD = "- grounded llm answers over the knowledge base on databricks"


def test_set_tags_in_place(tmp_path, monkeypatch):
    c = build_client(tmp_path, monkeypatch, role="admin")
    est = c.post("/api/estimates", json={"project_name": "Tagged", "prd_text": RAG_PRD, "client_context": {"tech_stack": ["Databricks"]}}).json()
    eid, v0 = est["estimate_id"], est["version"]

    r = c.post(f"/api/estimates/{eid}/tags", json={"tags": ["priority", "  RAG  ", ""]})
    assert r.status_code == 200, r.text
    assert r.json()["graph"]["tags"] == ["priority", "RAG"]   # trimmed, blanks dropped
    assert r.json()["version"] == v0  # auto-save in place, no version bump

    # Tags surface in the list summary.
    row = next(e for e in c.get("/api/estimates").json() if e["estimate_id"] == eid)
    assert row["tags"] == ["priority", "RAG"]
