"""Interactive recompute (spec §5.5 deal-shaping).

Given an existing Solution Graph and a set of knob overrides (AI boost, team
allocation, velocity, location mix), recompute velocity, duration, cost, and the
Monte Carlo distribution without re-matching or re-sizing. This powers the
UI sliders: work breakdown is held fixed, the levers move the numbers.
"""

from __future__ import annotations

import numpy as np
from pydantic import BaseModel, Field

from ..models.results import DeterministicResult, MonteCarloResult
from ..models.solution_graph import SolutionGraph
from . import montecarlo


class RecomputeOverrides(BaseModel):
    ai_boost: float | None = Field(default=None, ge=0.0, le=1.0)
    avg_story_pts: float | None = Field(default=None, gt=0.0)
    engineer_count: int | None = Field(default=None, ge=1)
    allocations: dict[str, float] | None = Field(
        default=None, description="discipline -> allocated headcount override."
    )


def recompute(graph: SolutionGraph, overrides: RecomputeOverrides, iterations: int = 10_000) -> SolutionGraph:
    """Return the graph with team/cost/results recomputed under the overrides."""
    variables = graph.variables.model_copy()
    if overrides.avg_story_pts is not None:
        variables.avg_story_pts = overrides.avg_story_pts

    # Apply allocation overrides to the team.
    team = graph.team_plan.model_copy(deep=True)
    if overrides.allocations:
        for role in team.roles:
            if role.discipline in overrides.allocations:
                role.allocated = overrides.allocations[role.discipline]

    engineers = overrides.engineer_count or max(
        1, int(round(sum(r.allocated for r in team.roles if r.discipline != "Project & Program Management")))
    )
    ai_boost = overrides.ai_boost if overrides.ai_boost is not None else 0.0

    # Velocity with AI boost (§2.3): (1 + AIBoost) * AvgStoryPts * engineers.
    velocity = (1.0 + ai_boost) * variables.avg_story_pts * engineers

    bottom_up = sum(montecarlo.deterministic_pert(wi.points, variables) for wi in graph.work_items)
    duration_sprints = bottom_up / velocity if velocity else 0.0
    duration_months = duration_sprints * variables.weeks_in_sprint / 4.345

    monthly = sum(r.day_rate * r.allocated * variables.working_month_days for r in team.roles)
    total_cost = round(monthly * duration_months, 2)
    team.monthly_cost = round(monthly, 2)
    team.total_cost = total_cost

    point_samples, effort_pct = montecarlo.simulate_points([wi.points for wi in graph.work_items], iterations)
    duration_samples = point_samples / velocity if velocity else np.zeros_like(point_samples)
    cost_per_point = (total_cost / bottom_up) if bottom_up else 0.0
    cost_samples = point_samples * cost_per_point

    updated = graph.model_copy(deep=True)
    updated.variables = variables
    updated.team_plan = team
    updated.deterministic = DeterministicResult(
        total_points=round(bottom_up, 2),
        total_cost=total_cost,
        per_phase_velocity={"single-phase": velocity},
    )
    updated.monte_carlo = MonteCarloResult(
        iterations=iterations,
        effort_points=effort_pct,
        duration_sprints=montecarlo.derive_percentiles(duration_samples),
        cost=montecarlo.derive_percentiles(cost_samples),
    )
    return updated
