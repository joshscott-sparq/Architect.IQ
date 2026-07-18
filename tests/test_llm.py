"""Contract: LLM ingest/matching/capabilities via an injected fake client,
plus deterministic fallback. No network."""

from architect_iq.core import estimation, llm
from architect_iq.models.graph import EdgeKind
from architect_iq.models.results import ClientContext

RAG_PRD = "- grounded llm answers over our knowledge base\n- runs on databricks with a vector store"


class FakeLLM:
    """Routes by prompt content to canned structured replies."""

    def complete_json(self, system, user, *, max_tokens=4000):
        if "Extract the requirements" in user:
            return {"requirements": [
                {"text": "Grounded answers over the corpus", "kind": "functional", "confidence": 0.9},
                {"text": "Runs on Databricks", "kind": "constraint", "confidence": 0.8},
            ]}
        if "score each pattern" in user:
            return {"matches": [
                {"pattern_id": "rag-databricks", "score": 0.95, "rationale": "clear RAG on Databricks"},
                {"pattern_id": "agentic-mcp", "score": 0.1, "rationale": "not agentic"},
            ]}
        if "derive 3-7 capabilities" in user:
            return {
                "capabilities": [
                    {"name": "Knowledge Retrieval", "description": "Find relevant context"},
                    {"name": "Answer Generation", "description": "Produce grounded answers"},
                ],
                "requirement_links": [0, 1],
                "component_links": {"Vector Store": 0, "Retrieval Orchestrator": 1},
            }
        return {}


def test_parse_json_object_tolerates_prose():
    assert llm._parse_json_object('Sure! {"a": 1} done')["a"] == 1


def test_llm_extract_and_rank_and_capabilities_directly():
    fake = FakeLLM()
    reqs = llm.extract_requirements(RAG_PRD, client=fake)
    assert len(reqs) == 2 and reqs[0]["kind"] == "functional"

    ranked = llm.rank_patterns(RAG_PRD, ["Databricks"], [
        {"id": "rag-databricks", "name": "RAG", "when_to_use": "..."},
        {"id": "agentic-mcp", "name": "Agentic", "when_to_use": "..."},
    ], client=fake)
    assert ranked[0]["pattern_id"] == "rag-databricks"

    caps = llm.derive_capabilities(RAG_PRD, ["r1", "r2"], ["Vector Store"], client=fake)
    assert [c["name"] for c in caps["capabilities"]] == ["Knowledge Retrieval", "Answer Generation"]


def test_build_estimate_uses_llm_path_when_injected():
    graph = estimation.build_estimate(
        "LLM RAG", RAG_PRD, ClientContext(tech_stack=["Databricks"]),
        use_llm=True, llm_client=FakeLLM(),
    )
    assert graph.matched_pattern_ids == ["rag-databricks"]
    # Capabilities are the LLM's higher-level ones, not 1:1 component names.
    cap_names = {c.name for c in graph.capabilities}
    assert "Knowledge Retrieval" in cap_names
    # Requirements came from the LLM.
    assert any("Grounded answers" in r.text for r in graph.requirements)
    # Provenance recorded in assumptions.
    assert any("LLM" in a for a in graph.assumptions)
    # Graph integrity: every requirement/capability edge resolves (model validated).
    assert graph.edges_of_kind(EdgeKind.REALIZED_BY)


def test_build_estimate_falls_back_without_llm():
    graph = estimation.build_estimate(
        "Heuristic RAG", RAG_PRD, ClientContext(tech_stack=["Databricks"]), use_llm=False
    )
    assert graph.matched_pattern_ids == ["rag-databricks"]
    assert any("heuristic" in a for a in graph.assumptions)


def test_llm_step_falls_back_on_error():
    class Boom:
        def complete_json(self, *a, **k):
            raise RuntimeError("api down")

    # Should not raise; each LLM step falls back to the heuristic.
    graph = estimation.build_estimate(
        "Resilient", RAG_PRD, ClientContext(tech_stack=["Databricks"]),
        use_llm=True, llm_client=Boom(),
    )
    assert graph.requirements and graph.capabilities
    assert any("heuristic" in a for a in graph.assumptions)
