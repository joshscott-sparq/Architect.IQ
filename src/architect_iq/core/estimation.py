"""Estimation core: build a Solution Graph and estimate it (spec §4.1-4.2, §2 calibration).

Skeleton depth (DECISIONS.md D9 build sequence): the graph is assembled from a
matched pattern with deterministic sizing, so the full vertical slice runs offline.
Requirement/capability derivation and per-item sizing are marked skeleton-level and
get replaced by LLM reasoning as the engine deepens. The estimation math
(PERT, PERT-beta Monte Carlo, top-down vs bottom-up reconciliation, cost) is real.
"""

from __future__ import annotations

import re

import numpy as np

from .. import data_loader
from ..models.graph import (
    Capability,
    Component,
    ComponentType,
    Edge,
    EdgeKind,
    Provenance,
    Requirement,
    RequirementKind,
)
from ..models.pattern import ParametricCost, Pattern
from ..models.results import (
    ClientContext,
    DataVersions,
    DeterministicResult,
    MonteCarloResult,
    ReconciliationResult,
)
from ..models.solution_graph import SolutionGraph
from ..models.team import Location, RateRow, Role, TeamPlan
from ..models.variables import Variables
from ..models.work_item import CureAssessment, ThreePoint, WorkItem, WorkLevel
from . import montecarlo
from .matcher import PatternMatch, score_patterns

SIZE_ORDER = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"]

# Skeleton default feature-scale size per component type (deterministic sizing).
_TYPE_SIZE = {
    ComponentType.DATASTORE: "S",
    ComponentType.SERVICE: "M",
    ComponentType.PIPELINE: "L",
    ComponentType.ML_MODEL: "L",
    ComponentType.UI: "M",
    ComponentType.GATEWAY: "M",
    ComponentType.QUEUE: "S",
    ComponentType.INTEGRATION: "M",
    ComponentType.EXTERNAL_SYSTEM: "XS",
}

_BULLET = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+")
_WORD = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> set[str]:
    return set(_WORD.findall(text.lower()))


def extract_requirements(prd_text: str, max_items: int = 60) -> list[Requirement]:
    """Skeleton extraction: bullet/sentence lines become requirements (§3.1).

    Confidence is fixed-low to reflect naive extraction; the LLM ingest step
    replaces this and sets real per-item confidence.
    """
    requirements: list[Requirement] = []
    for line in prd_text.splitlines():
        stripped = _BULLET.sub("", line).strip()
        if len(stripped) < 10:
            continue
        requirements.append(
            Requirement(
                id=f"req-{len(requirements) + 1}",
                text=stripped[:300],
                kind=RequirementKind.FUNCTIONAL,
                extraction_confidence=0.5,
            )
        )
        if len(requirements) >= max_items:
            break
    return requirements


def _three_point_for_size(size: str, feature_points: dict[str, dict]) -> ThreePoint:
    """Feature-scale 3-point estimate: realistic at `size`, O/P one size each way."""
    idx = SIZE_ORDER.index(size)
    opt_size = SIZE_ORDER[max(0, idx - 1)]
    pes_size = SIZE_ORDER[min(len(SIZE_ORDER) - 1, idx + 1)]
    return ThreePoint(
        realistic=feature_points[size]["feature"],
        optimistic=feature_points[opt_size]["feature"],
        pessimistic=feature_points[pes_size]["feature"],
    )


def _driver_quantities(components: list[Component], edges: list[Edge], context: ClientContext) -> dict[str, float]:
    """Derive parametric driver quantities from the graph and context (§4.2)."""
    integration_count = sum(
        1 for e in edges if e.kind in {EdgeKind.INTEGRATES_WITH, EdgeKind.DATA_FLOW}
    )
    return {
        "integration": float(integration_count),
        "data_source": float(max(1, len(context.tech_stack))),
        "environment": 2.0,  # skeleton default: staging + prod
        "extracted_service": float(sum(1 for c in components if c.component_type is ComponentType.SERVICE)),
        "tool_server": float(sum(1 for c in components if c.component_type is ComponentType.INTEGRATION)),
        "data_entity": float(sum(1 for c in components if c.component_type is ComponentType.DATASTORE)),
    }


def _instantiate_pattern(pattern: Pattern, feature_points: dict[str, dict]) -> tuple[
    list[Capability], list[Component], list[WorkItem], list[Edge]
]:
    """Seed capabilities, components, work items, and edges from a matched pattern."""
    components: list[Component] = []
    capabilities: list[Capability] = []
    work_items: list[WorkItem] = []
    edges: list[Edge] = []
    name_to_component_id: dict[str, str] = {}

    for i, spec in enumerate(pattern.components, start=1):
        comp_id = f"cmp-{i}"
        name_to_component_id[spec.name] = comp_id
        components.append(
            Component(
                id=comp_id,
                name=spec.name,
                component_type=spec.component_type,
                technology=spec.technology,
                description=spec.description,
                provenance=Provenance.PATTERN,
                pattern_id=pattern.id,
                discipline=spec.discipline,
            )
        )
        # Skeleton: one capability per component (LLM derivation replaces this).
        cap_id = f"cap-{i}"
        capabilities.append(
            Capability(id=cap_id, name=spec.name, description=spec.description, provenance=Provenance.PATTERN)
        )
        edges.append(Edge(source_id=cap_id, target_id=comp_id, kind=EdgeKind.REALIZED_BY, confidence=0.6))

        # One feature-level work item per component, sized by type.
        size = _TYPE_SIZE.get(spec.component_type, "M")
        work_items.append(
            WorkItem(
                id=f"wi-{i}",
                level=WorkLevel.FEATURE,
                epic=pattern.name,
                feature=spec.name,
                points=_three_point_for_size(size, feature_points),
                cure=CureAssessment(
                    complexity=3, unknowns=3, risks=2, effort=3,
                    rationale=f"Skeleton sizing: {spec.component_type.value} default {size}.",
                    confidence=0.4,
                ),
                practice=None,
                discipline=spec.discipline,
                extraction_confidence=0.5,
            )
        )
        edges.append(Edge(source_id=comp_id, target_id=f"wi-{i}", kind=EdgeKind.IMPLEMENTED_BY, confidence=0.6))

    for spec in pattern.integrations:
        src = name_to_component_id.get(spec.source)
        dst = name_to_component_id.get(spec.target)
        if src and dst:
            edges.append(Edge(source_id=src, target_id=dst, kind=spec.kind, label=spec.label))

    return capabilities, components, work_items, edges


def _link_requirements(requirements: list[Requirement], capabilities: list[Capability]) -> list[Edge]:
    """Skeleton: link each requirement to the best token-overlap capability."""
    edges: list[Edge] = []
    cap_tokens = [(c, _tokens(c.name)) for c in capabilities]
    for req in requirements:
        rt = _tokens(req.text)
        best, best_overlap = None, 0
        for cap, ct in cap_tokens:
            overlap = len(rt & ct)
            if overlap > best_overlap:
                best, best_overlap = cap, overlap
        if best is None and capabilities:
            best = capabilities[0]
        if best is not None:
            edges.append(
                Edge(
                    source_id=req.id, target_id=best.id, kind=EdgeKind.SATISFIED_BY,
                    confidence=0.4 if best_overlap == 0 else 0.6,
                )
            )
    return edges


def _build_team(
    components: list[Component],
    rates: list[RateRow],
    context: ClientContext,
    variables: Variables,
) -> TeamPlan:
    """Skeleton team: one role per distinct discipline + PM, default Senior tier."""
    location = Location.US
    if context.us_ns_mix.get("NS", 0) > context.us_ns_mix.get("US", 0):
        location = Location.NS

    rate_index = {(r.discipline, r.tier, r.location): r.day_rate for r in rates}

    disciplines = {c.discipline for c in components if c.discipline}
    disciplines.add("Project & Program Management")

    roles: list[Role] = []
    for discipline in sorted(disciplines):
        tier = "Senior Lead" if discipline in {"Solutions Architect", "Project & Program Management"} else "Senior"
        day_rate = (
            rate_index.get((discipline, tier, location))
            or rate_index.get((discipline, tier, Location.US))
            or 0.0
        )
        roles.append(
            Role(
                discipline=discipline, tier=tier, location=location,
                suggested=1.0, allocated=1.0, day_rate=day_rate,
            )
        )

    monthly = sum(r.day_rate * variables.working_month_days for r in roles)
    plan = TeamPlan(roles=roles, monthly_cost=round(monthly, 2))
    return plan


def build_estimate(
    project_name: str,
    prd_text: str,
    context: ClientContext | None = None,
    iterations: int = 10_000,
    match_override: str | None = None,
    parametric_override: "ParametricCost | None" = None,
    rates: "list[RateRow] | None" = None,
) -> SolutionGraph:
    """Build and estimate a Solution Graph from a PRD + client context.

    Deterministic path (offline): match a pattern, instantiate the graph, size
    bottom-up, compute top-down, reconcile, build a team, and run Monte Carlo.
    """
    context = context or ClientContext()

    feature_points, tshirt_v = data_loader.load_tshirt_scale()
    variables, vars_v = data_loader.load_variables()
    patterns, patterns_v = data_loader.load_patterns()
    if rates is None:
        rates, pricing_v, _ = data_loader.load_pricing()
    else:
        pricing_v = "custom-upload"
    _, complexity_v = data_loader.load_complexity_factors()
    _, practices_v = data_loader.load_practices()
    _, _, _, tiers_v = data_loader.load_tiers()

    requirements = extract_requirements(prd_text)

    ranked = score_patterns(prd_text, context, patterns)
    chosen_id = match_override or (ranked[0].pattern_id if ranked else None)
    pattern = patterns[chosen_id] if chosen_id else None

    assumptions: list[str] = []
    if pattern is None:
        raise ValueError("No patterns available to match against.")
    top_match = next((m for m in ranked if m.pattern_id == chosen_id), ranked[0])
    assumptions.append(f"Matched pattern '{pattern.name}' ({top_match.rationale}).")
    assumptions.append("Capability derivation and per-item sizing are skeleton-level (LLM step pending).")

    capabilities, components, work_items, edges = _instantiate_pattern(pattern, feature_points)
    edges += _link_requirements(requirements, capabilities)

    # --- Bottom-up (work-item rollup, deterministic PERT in feature-scale points) ---
    bottom_up = sum(montecarlo.deterministic_pert(wi.points, variables) for wi in work_items)

    # --- Top-down (pattern parametric; tuned prior from memory when provided) ---
    parametric = parametric_override or pattern.parametric_cost
    if parametric_override is not None:
        assumptions.append(
            f"Top-down base tuned by memory: {pattern.parametric_cost.base_effort_points:.0f} "
            f"-> {parametric_override.base_effort_points:.0f} points (reference class)."
        )
    drivers = _driver_quantities(components, edges, context)
    top_down = parametric.estimate_points(drivers)
    reconciliation = ReconciliationResult(
        top_down_points=round(top_down, 2),
        bottom_up_points=round(bottom_up, 2),
    )
    if reconciliation.is_divergent():
        assumptions.append(
            f"Top-down ({top_down:.0f}) and bottom-up ({bottom_up:.0f}) diverge "
            f"{reconciliation.delta_pct * 100:.0f}%; flagged for the critique pass."
        )

    # --- Team + cost ---
    team = _build_team(components, rates, context, variables)
    engineers = max(1, sum(1 for r in team.roles if r.discipline != "Project & Program Management"))
    velocity = variables.avg_story_pts * engineers
    duration_sprints = bottom_up / velocity if velocity else 0.0
    duration_months = duration_sprints * variables.weeks_in_sprint / 4.345
    total_cost = round((team.monthly_cost or 0.0) * duration_months, 2)
    team.total_cost = total_cost

    # --- Monte Carlo (effort, duration, cost) ---
    point_samples, effort_pct = montecarlo.simulate_points([wi.points for wi in work_items], iterations)
    duration_samples = point_samples / velocity if velocity else np.zeros_like(point_samples)
    cost_per_point = (total_cost / bottom_up) if bottom_up else 0.0
    cost_samples = point_samples * cost_per_point
    monte_carlo = MonteCarloResult(
        iterations=iterations,
        effort_points=effort_pct,
        duration_sprints=montecarlo.derive_percentiles(duration_samples),
        cost=montecarlo.derive_percentiles(cost_samples),
    )

    deterministic = DeterministicResult(
        total_points=round(bottom_up, 2),
        total_cost=total_cost,
        per_phase_velocity={"single-phase": velocity},
    )

    return SolutionGraph(
        project_name=project_name,
        client_context=context,
        requirements=requirements,
        capabilities=capabilities,
        components=components,
        work_items=work_items,
        edges=edges,
        variables=variables,
        team_plan=team,
        matched_pattern_ids=[pattern.id],
        deterministic=deterministic,
        monte_carlo=monte_carlo,
        reconciliation=reconciliation,
        data_versions=DataVersions(
            tshirt_scale=tshirt_v,
            variables=vars_v,
            complexity_factors=complexity_v,
            practices=practices_v,
            tiers=tiers_v,
            pricing=pricing_v,
            patterns=patterns_v,
        ),
        assumptions=assumptions,
        ranked_matches=[{"pattern_id": m.pattern_id, "score": m.score, "rationale": m.rationale} for m in ranked],
    )
