"""Contract: scenario computation and the optimization advisor."""

from architect_iq.core import advisor, estimation
from architect_iq.core.rates import RateCard
from architect_iq.core.scenarios import compute_scenario, default_scenarios
from architect_iq.data_loader import load_dev_models
from architect_iq.models.enums import Location
from architect_iq.models.results import ClientContext
from architect_iq.models.scenario import Scenario
from architect_iq.models.team import RateRow

RAG_PRD = "- grounded llm answers over the knowledge base on databricks\n- vector store retrieval\n- evaluation harness"

RATES = [
    RateRow(discipline="AI & ML", tier="Senior", location=Location.US, day_rate=2000),
    RateRow(discipline="AI & ML", tier="Senior", location=Location.NS, day_rate=1100),
    RateRow(discipline="Data Engineering", tier="Senior", location=Location.US, day_rate=1800),
    RateRow(discipline="Data Engineering", tier="Senior", location=Location.NS, day_rate=1000),
    RateRow(discipline="Web", tier="Senior", location=Location.US, day_rate=1600),
    RateRow(discipline="Web", tier="Senior", location=Location.NS, day_rate=900),
    RateRow(discipline="Project & Program Management", tier="Senior Lead", location=Location.US, day_rate=2000),
    RateRow(discipline="Project & Program Management", tier="Senior Lead", location=Location.NS, day_rate=1200),
]


def _graph():
    return estimation.build_estimate("RAG", RAG_PRD, ClientContext(tech_stack=["Databricks"]), rates=RATES, use_llm=False)


def test_blended_rate_weights_locations():
    card = RateCard(RATES)
    us = card.rate_for("AI & ML", "Senior", Location.US)
    ns = card.rate_for("AI & ML", "Senior", Location.NS)
    blended = card.blended_rate("AI & ML", "Senior", {"US": 0.5, "NS": 0.5})
    assert abs(blended - (us + ns) / 2) < 1e-6


def test_agentic_faster_than_traditional():
    graph = _graph()
    dev_models, _ = load_dev_models()
    card = RateCard(RATES)
    trad = compute_scenario(graph, Scenario(id="t", name="Trad", dev_model="traditional"), card, dev_models)
    agentic = compute_scenario(graph, Scenario(id="a", name="Agentic", dev_model="agentic"), card, dev_models)
    # Agentic lifts velocity and automates some scope -> shorter duration.
    assert agentic.duration_sprints.p50 < trad.duration_sprints.p50
    assert agentic.effort_points.p50 < trad.effort_points.p50  # effort_multiplier < 1


def test_nearshore_cheaper_than_onshore():
    graph = _graph()
    dev_models, _ = load_dev_models()
    card = RateCard(RATES)
    us = compute_scenario(graph, Scenario(id="us", name="US", dev_model="traditional", location_mix={"US": 1.0}), card, dev_models)
    ns = compute_scenario(graph, Scenario(id="ns", name="NS", dev_model="traditional", location_mix={"NS": 1.0}), card, dev_models)
    assert ns.total_cost < us.total_cost


def test_default_scenarios_span_models():
    graph = _graph()
    dev_models, _ = load_dev_models()
    card = RateCard(RATES)
    results = [compute_scenario(graph, s, card, dev_models) for s in default_scenarios()]
    assert len(results) == 4
    assert all(r.total_cost >= 0 for r in results)


def test_advisor_suggests_cheaper_and_faster():
    graph = _graph()
    dev_models, _ = load_dev_models()
    suggestions = advisor.suggest_team_models(graph, RateCard(RATES), dev_models, past=[], use_llm=False)
    goals = {s.goal for s in suggestions}
    assert {"cheaper", "faster"} <= goals
    # Each suggestion carries a computed result.
    assert all(s.result is not None for s in suggestions)
    cheaper = next(s for s in suggestions if s.goal == "cheaper")
    assert cheaper.result.total_cost < graph.deterministic.total_cost


def test_advisor_suggests_deferrals():
    graph = _graph()
    deferrals = advisor.suggest_deferrals(graph, use_llm=False)
    assert deferrals
    assert all(d.est_sprint_saving > 0 for d in deferrals)
    assert all(d.work_item_id for d in deferrals)
