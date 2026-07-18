"""Demo-mode seeding.

Populates the store with curated estimates so every surface is visible without
manual entry: all three patterns (distinct architectures/diagrams), a
reference-class pair (shared pattern + tech, so memory retrieval lights up), an
estimate with recorded actuals that tunes the next one's prior, and a
recomputed estimate that shows versioning.

Idempotent by project name: re-seeding skips scenarios already present. Run as
`python -m architect_iq.demo [db_path]` for headless seeding.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .core.recompute import RecomputeOverrides, recompute
from .memory.priors import ActualOutcome
from .models.results import ClientContext
from .service import EstimateService


@dataclass
class DemoScenario:
    project_name: str
    prd_text: str
    context: ClientContext
    actual_points: float | None = None  # record actuals -> tunes later priors
    recompute: RecomputeOverrides | None = None  # create a v2 to show versioning
    note: str = ""


DEMO_SCENARIOS: list[DemoScenario] = [
    DemoScenario(
        project_name="[Demo] Acme Insurance — Claims Knowledge Assistant",
        prd_text=(
            "- Build a retrieval augmented generation platform over ten years of claims documents\n"
            "- Adjusters query unstructured policy and claim files and receive grounded llm answers with citations\n"
            "- Ingestion and embedding pipelines run on databricks with a managed vector store\n"
            "- Evaluation harness measures answer quality and guards against regressions\n"
            "- Web chat UI for the adjuster team with feedback capture\n"
            "- All data stays within the client tenant for compliance"
        ),
        context=ClientContext(
            tech_stack=["Databricks", "Python", "React"],
            compliance_posture=["SOC 2", "HIPAA"],
            team_skills=["Spark", "LLMs", "React"],
            us_ns_mix={"US": 0.7, "NS": 0.3},
        ),
        actual_points=210,
        note="Delivered actual recorded; tunes the RAG prior for later estimates.",
    ),
    DemoScenario(
        project_name="[Demo] Meridian Bank — Policy Copilot",
        prd_text=(
            "- Retrieval augmented generation copilot over banking policy and procedure documents\n"
            "- Relationship managers ask questions and get grounded answers with source links\n"
            "- Embeddings and retrieval on databricks, vector store for similarity search\n"
            "- Quality evaluation and audit logging for every answer\n"
            "- Internal web UI"
        ),
        context=ClientContext(
            tech_stack=["Databricks", "Azure", "Python"],
            compliance_posture=["SOC 2", "PCI DSS"],
            team_skills=["Spark", "LLMs"],
        ),
        note="Second RAG engagement; shares pattern + Databricks -> memory references the Acme estimate and uses the tuned prior.",
    ),
    DemoScenario(
        project_name="[Demo] Corom Manufacturing — Legacy .NET Modernization",
        prd_text=(
            "- Modernize a fifteen year old .net monolith running the order management system\n"
            "- Strangler-fig decomposition into services behind an api gateway\n"
            "- Extract the pricing, inventory, and fulfillment bounded contexts into services\n"
            "- Migrate the order database to a managed sql store\n"
            "- Stand up ci/cd pipelines and staging plus production environments\n"
            "- No downtime cutover"
        ),
        context=ClientContext(
            tech_stack=[".NET", "SQL Server", "Azure"],
            compliance_posture=["SOC 2"],
            team_skills=[".NET", "Azure DevOps"],
        ),
        recompute=RecomputeOverrides(ai_boost=0.3, engineer_count=7),
        note="Different pattern (distinct architecture diagram); recomputed to v2 to show versioning + deal-shaping.",
    ),
    DemoScenario(
        project_name="[Demo] Helios Logistics — Autonomous Dispatch Agent",
        prd_text=(
            "- Agentic workflow that triages dispatch exceptions and proposes resolutions\n"
            "- Orchestrator calls internal systems as tools over mcp\n"
            "- Tool servers wrap the routing, carrier, and ticketing systems\n"
            "- Guardrail service enforces approval policy before any action\n"
            "- Observability layer traces and evaluates every agent run\n"
            "- Operator UI for human in the loop review and approvals"
        ),
        context=ClientContext(
            tech_stack=["MCP", "Python", "TypeScript"],
            compliance_posture=["SOC 2"],
            team_skills=["Python", "LLMs", "agents"],
        ),
        note="Agentic-on-MCP pattern; third distinct architecture.",
    ),
    DemoScenario(
        project_name="[Demo] Northwind Retail — Support Automation Agent",
        prd_text=(
            "- Agentic assistant that resolves tier-one support tickets autonomously\n"
            "- Orchestration loop plans multi step actions and calls tools over mcp\n"
            "- Mcp tool servers integrate the order, returns, and CRM systems\n"
            "- Guardrails and approval gating for refunds and account changes\n"
            "- Tracing and evaluation for auditability\n"
            "- Agent console for support leads"
        ),
        context=ClientContext(
            tech_stack=["MCP", "TypeScript", "Node"],
            compliance_posture=["SOC 2"],
            team_skills=["TypeScript", "agents"],
        ),
        note="Second agentic engagement; references Helios via shared pattern + MCP.",
    ),
]


def is_seeded(service: EstimateService) -> bool:
    names = {s.project_name for s in service.list_estimates()}
    return any(sc.project_name in names for sc in DEMO_SCENARIOS)


def seed_demo(service: EstimateService) -> dict:
    """Seed demo scenarios idempotently. Returns a summary."""
    existing = {s.project_name for s in service.list_estimates()}
    created: list[dict] = []

    for sc in DEMO_SCENARIOS:
        if sc.project_name in existing:
            continue
        stored, refs = service.create_estimate(sc.project_name, sc.prd_text, sc.context)

        if sc.recompute is not None:
            updated = recompute(stored.graph, sc.recompute)
            stored = service.update_estimate(stored.estimate_id, updated)

        if sc.actual_points is not None:
            service.record_actuals(
                ActualOutcome(estimate_id=stored.estimate_id, delivered_points=sc.actual_points)
            )

        created.append({
            "estimate_id": stored.estimate_id,
            "project_name": sc.project_name,
            "version": stored.version,
            "pattern_ids": stored.graph.matched_pattern_ids,
            "references": len(refs),
        })

    return {"created": created, "created_count": len(created), "total": len(service.list_estimates())}


def _main() -> None:
    import sys

    db_path = sys.argv[1] if len(sys.argv) > 1 else "architect_iq.db"
    summary = seed_demo(EstimateService(db_path=db_path))
    print(f"Seeded {summary['created_count']} demo estimates into {db_path}. Total: {summary['total']}.")


if __name__ == "__main__":
    _main()
