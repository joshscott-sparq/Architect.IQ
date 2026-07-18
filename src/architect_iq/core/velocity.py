"""Team velocity with diminishing returns (spec §2.3, DECISIONS.md D11 fix).

Velocity scales sub-linearly with team size: doubling engineers does not double
throughput (Brooks). Using an exponent < 1 means adding engineers shortens the
timeline but raises total cost (monthly burn scales linearly with headcount while
duration only falls by n**-exponent), which fixes the earlier bug where more
engineers looked strictly cheaper.
"""

from __future__ import annotations

# Sub-linear scaling exponent. 1.0 = linear (no coordination cost); lower = more
# drag from coordination. 0.85 is a moderate, defensible default.
DIMINISHING_EXPONENT = 0.85


def effective_engineers(engineers: float) -> float:
    return max(1.0, engineers) ** DIMINISHING_EXPONENT


def team_velocity(avg_story_pts: float, engineers: float, ai_boost: float = 0.0) -> float:
    """Story points per sprint for the team.

    `(1 + ai_boost) * AvgStoryPts * engineers**DIMINISHING_EXPONENT` (§2.3).
    """
    return (1.0 + ai_boost) * avg_story_pts * effective_engineers(engineers)
