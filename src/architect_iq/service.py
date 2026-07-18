"""Application service: ties the engine, persistence, and memory together.

The API and CLI call this rather than reaching into layers directly. It applies
memory (tuned priors + reference-class retrieval) on the way in, persists the
result on the way out, and keeps in-memory actuals for calibration.
"""

from __future__ import annotations

from pathlib import Path

from . import data_loader
from .core import estimation
from .core.rates import RateCard, recost
from .memory.priors import ActualOutcome, tune_pattern_prior
from .memory.retrieval import Reference, find_references
from .models.results import ClientContext
from .models.solution_graph import SolutionGraph
from .models.team import RateRow
from .persistence.store import EstimateRepository, SQLiteEstimateRepository, StoredEstimate


class EstimateService:
    def __init__(self, repo: EstimateRepository | None = None, db_path: str | Path = "architect_iq.db"):
        self.repo = repo or SQLiteEstimateRepository(db_path)
        # Actuals held in-process for now; a table lands with the Phase 4 loop.
        self._actuals: dict[str, ActualOutcome] = {}
        # Active rate card override (uploaded). None -> default pricing file.
        self._rate_rows: list[RateRow] | None = None

    def active_rates(self) -> tuple[list[RateRow], str]:
        """The rate rows in effect and a source label."""
        if self._rate_rows is not None:
            return self._rate_rows, "custom-upload"
        rows, _, source_file = data_loader.load_pricing()
        return rows, source_file

    def set_rate_card(self, rows: list[RateRow]) -> None:
        self._rate_rows = rows

    def recost_estimate(self, estimate_id: str) -> StoredEstimate:
        """Reprice an estimate under the active rate card; persist a new version."""
        stored = self.repo.get(estimate_id)
        if stored is None:
            raise KeyError(f"estimate {estimate_id!r} not found")
        rows, _ = self.active_rates()
        repriced = recost(stored.graph, RateCard(rows))
        return self.repo.update(estimate_id, repriced)

    def create_estimate(
        self,
        project_name: str,
        prd_text: str,
        context: ClientContext | None = None,
        match_override: str | None = None,
    ) -> tuple[StoredEstimate, list[Reference]]:
        """Build with memory-tuned priors, persist, and return with references."""
        context = context or ClientContext()
        patterns, _ = data_loader.load_patterns()
        past = self.repo.all_latest()

        # First pass to know which pattern matched, so we can tune its prior.
        preview_matches = estimation.score_patterns(prd_text, context, patterns)
        chosen_id = match_override or (preview_matches[0].pattern_id if preview_matches else None)

        parametric_override = None
        if chosen_id and chosen_id in patterns:
            prior = tune_pattern_prior(
                chosen_id, patterns[chosen_id].parametric_cost, past, self._actuals
            )
            if prior.sample_count > 0:
                parametric_override = prior.as_parametric(patterns[chosen_id].parametric_cost)

        rates, _ = self.active_rates()
        graph = estimation.build_estimate(
            project_name, prd_text, context,
            match_override=match_override, parametric_override=parametric_override,
            rates=rates,
        )
        references = find_references(prd_text, context, graph.matched_pattern_ids, past)
        stored = self.repo.create(graph)
        return stored, references

    def get_estimate(self, estimate_id: str, version: int | None = None) -> StoredEstimate | None:
        return self.repo.get(estimate_id, version)

    def update_estimate(self, estimate_id: str, graph: SolutionGraph) -> StoredEstimate:
        """Persist an edited graph as a new version (interactive editing)."""
        return self.repo.update(estimate_id, graph)

    def list_estimates(self):
        return self.repo.list_summaries()

    def record_actuals(self, outcome: ActualOutcome) -> None:
        """Feed delivery actuals into memory for prior calibration (§4.4)."""
        self._actuals[outcome.estimate_id] = outcome
