# DECISIONS.md

Log of judgment calls made during the Architect.IQ build that the spec
(`architect-iq-context.md`) did not fully cover. Each entry: the call, the
reason, and the spec reference it relates to.

## D1. Repo layout: standalone at root
**Call:** Build the engine at the repository root (`src/architect_iq/`, `tests/`,
`skill/`), not under `packages/architect-iq/`.
**Why:** The spec text (§, §6.2) names `Sparq-Holding-Inc/solutions-labs` with a
`packages/architect-iq/` path, but the actual repo is the standalone
`Architect.IQ`. Owner confirmed on 2026-07-17 to treat it as a standalone repo
deployed as a standalone application.

## D2. Points storage: native per-level, story-point normalization in core
**Call:** `WorkItem` stores its 3-point (R/O/P) estimate in the native per-level
t-shirt scale from §2.2 (Story M = 5, Feature M = 12.5, Epic M = 50). Core
exposes a story-point normalization; the §2.2 table is already story-point-scaled
(Feature M = 2.5 stories, Epic M = 10 stories), so normalization is a direct
read, not a re-scaling. The Epic/Feature multiplier (§2.1) applies to
linked-parameter impact at epic/feature level, not to the base points.
**Why:** Owner wants both workbook fidelity (deterministic mode must match the
sheet) and a story-point measure the delivery teams work in. Storing native keeps
deterministic mode exact; normalizing in core surfaces story points without a
second source of truth. Ref §2.1, §2.2.

## D3. PesWeight seeded at 1.2
**Call:** `variables.yaml` seeds `PesWeight = 1.2` (the value §2.1 states is
verified from the workbook), with the 1.1-1.5 guidance range recorded as metadata.
**Why:** §2.1 gives "PesWeight = 1.2 (default 1.1, raise to 1.5 with many
unknowns)" — the stated verified value and the stated default differ. The
verified workbook value governs deterministic parity; the range is available for
overrides in the contextualize step. Ref §2.1.

## D4. AvgStoryPts seeded at 9
**Call:** `variables.yaml` seeds `AvgStoryPts = 9`, with default 8 / range 7-10
recorded as metadata.
**Why:** Same stated-value-vs-default pattern as D3. §2.3 gives "AvgStoryPts = 9
... (default 8, range 7-10)"; the verified value governs parity. Ref §2.3.

## D5. Complexity factor library: structure complete, exact severity curves pending
**Call:** `complexity_factors.yaml` encodes all factor families, their category
grouping, the documented severity ladders (§2.4: 0 / -0.25 / -0.5 / -0.75 / -1.0),
and the families that start at -0.25 (integrations, security/compliance,
staffing difficulty). Every value is flagged with provenance
`default-ladder-pending-A44:C152`.
**Why:** §2.4 describes the ladder and exceptions but does not transcribe the
per-family values from `RiskLookups!A44:C152`. Because the library is data
(design goal: adding/correcting a factor is a data edit, no code change), the
exact values can be dropped in later with zero code impact. FLAGGED to owner.

## D6. Factor family count (27 vs enumerated 29)
**Call:** Encoded the families as enumerated from §2.4 prose. §2.4 states "27
factor families" but the prose enumerates ~29 depending on how compound entries
("schedule/scope/cost flexibility", "data availability/quality") are split.
**Why:** Needs the workbook family list to reconcile exactly. FLAGGED to owner.
Correcting is a data edit. Ref §2.4.

## D17. Multiple saved rate cards (one active, one default)
**Call:** Rate cards are persisted in SQLite (shared DB): multiple named cards,
exactly one active, one default (seeded from the placeholder pricing file). The
active card feeds estimate build, re-cost, and scenarios. Default cannot be
deleted; deleting the active card reverts to default. Cards hold
(discipline, tier, location, day_rate) rows.
**Why:** Owner asked for multiple saved cards with one active and one default,
each carrying role/location/rate — replacing the earlier single in-memory card.

## D16. Scenarios + optimization advisor
**Call:** Each estimate can compute multiple named scenarios (Scenario +
ScenarioResult) over the same work breakdown: development model (traditional /
ai-assisted / agentic, from `dev_models.yaml` — ai_boost + effort_multiplier) and
location mix (US / NS / blended, via RateCard.blended_rate). An advisor
(`core/advisor.py`) suggests cheaper/faster team models (computed for real
numbers) and features to defer to a later release, LLM-primary with heuristic
fallback, grounded in historical estimates (reference class) so it improves as
engagements accumulate.
**Why:** Owner asked that each estimate handle multiple staffing/development
models with assumptions, that the LLM suggest cheaper/faster team models and
deferrable features, and that historical estimates train the suggestion engine.

## D15. LLM ingest/matching + .env; cost model
**Call:** LLM layer (`core/llm.py`, injectable client) does requirement
extraction, capability derivation, and pattern ranking; each falls back to a
deterministic heuristic on no-key/error. Enabled by `ANTHROPIC_API_KEY` (loaded
from `.env` via python-dotenv); `ARCHITECTIQ_DISABLE_LLM` forces the heuristic
path, `ARCHITECTIQ_LLM_MODEL` overrides the model. Team velocity now scales
sub-linearly with headcount (`core/velocity.py`, Brooks exponent 0.85) and the
engineer-count knob scales team allocations, so adding engineers shortens the
timeline without looking strictly cheaper (fixes the D11 bug).
**Why:** Owner asked to wire the LLM layer, add an env setting for the API key,
and fix the engineer-count cost model.

## D14. Frontend styling: Tailwind CSS v4
**Call:** Frontend uses Tailwind CSS v4 (via `@tailwindcss/vite`), with the Sparq
brand palette declared as `@theme` tokens (`brand-orange`, `brand-green`,
`brand-aurora`, etc.) so utilities like `bg-brand-orange` carry the brand. A few
repeated widgets (`card`, `btn`, `field`, `badge`) stay as `@apply` component
classes; everything else is utility classes in JSX.
**Why:** Owner set the stack constraint "React or Vue with Tailwind" for the
frontend, "Node or Python" for the backend. React + FastAPI already complied; the
hand-rolled CSS was migrated to Tailwind to meet the styling requirement.

## D13. Loadable rate cards for leverage modeling
**Call:** Rate cards (roles + rates) are loadable at runtime (CSV/XLSX/YAML) via
`POST /api/rates`, held as the active card in the service, and used for new
estimates and for re-costing existing ones (`POST /api/estimates/{id}/recost`).
Re-cost holds effort and duration fixed and only re-derives role rates,
monthly/total cost, and the cost distribution (rates don't change the work).
Committed example cards live in `examples/` (onshore vs blended leverage).
**Why:** Owner wants to model different leverage models, teams, and prices.
Changing team tier/location mix (beyond re-pricing fixed roles) is a further
lever noted for later; the current card reprices the fixed team composition.

## D12. Demo mode gated by Vite run mode
**Call:** Demo mode is a distinct frontend run mode, not always-on. `npm run demo`
(= `vite --mode demo`, loading `.env.demo` with `VITE_DEMO_MODE=true`) enables it;
`npm run dev` and `npm run prod` do not. In demo mode the app auto-seeds curated
sample data on load (idempotent) and lands on the estimates list, so every
feature is immediately testable with dummy data; a "Load demo data" button also
re-seeds on demand. Demo estimates are name-prefixed `[Demo]`; outside demo mode
the list filters them out client-side, and the backend `POST /api/demo/seed`
endpoint stays available but is only invoked by the demo frontend. Backend demo
seeding lives in `architect_iq/demo.py` (also runnable headless via
`python -m architect_iq.demo`).
**Why:** Owner asked that demo show only under `npm run demo`, and that demo mode
always serve as a full sample sandbox exercising every function. Frontend-flag
gating + client-side `[Demo]` filtering honors both without backend mode
coupling. The `[Demo]` prefix filter is a skeleton approach; a persisted
demo/sample flag on the estimate would be cleaner if this grows.

## D11. Known skeleton gaps (to close when deepening the math)
Surfaced during the full-stack slice verification (2026-07-17). All are
skeleton-depth simplifications, not final behavior:
- **Recompute cost vs headcount:** the `engineer_count` knob raises velocity
  (shortens duration) but does not add those engineers' cost to the monthly burn,
  because the team table roles are unchanged. Result: adding engineers currently
  looks strictly cheaper. Fix when deepening: grow role allocations with
  engineer_count so monthly cost scales with the team, and model the
  points-per-engineer diminishing return (Brooks). Until then the cost knob is
  directional only.
- **Capability derivation is 1:1 with components** (skeleton), not true
  higher-level capabilities. Replace with LLM-derived capabilities.
- **Requirement extraction is line-based**, confidence fixed at 0.5. Replace with
  the LLM ingest step (§3.1) that sets real per-item confidence.
- **Pattern parametric values are starter calibration**, tuned only by the
  shrinkage prior once real estimates/actuals accumulate.
- **LLM matcher not yet wired**; deterministic signal-overlap match is the only
  path running. LLM match is the planned primary when a key is present.

## D10. Deterministic (workbook) vs Monte Carlo values diverge by design
**Call:** Keep both a deterministic point estimate (workbook weighted mean, §2.1,
with PesWeight 1.2 / OptWeight 0.95) and the PERT-beta Monte Carlo distribution
(lambda=4). They are different methodologies and will not agree: the workbook
weighting is pessimism-loaded, so its mean can exceed the MC P90. Label them
distinctly in the UI; do not force the MC distribution to re-center on the
workbook value. The gap is treated like the top-down/bottom-up gap — a signal for
the critique pass, not an error. Cost/monthly formula also departs from the literal
§2.6 "DayRate * WorkingMonthDays * 8": rates in our schema are per working day, so
monthly = day_rate * WorkingMonthDays (the sheet appears to store an hourly rate).
**Why:** §3 originally required deterministic mode to match the workbook exactly,
but the workbook is now calibration-only (D8), and §4.1 makes Monte Carlo the
primary output. Surfacing the divergence is more honest than hiding it. Revisit
lambda / weighting during the Phase 4 calibration loop against actuals.

## D9. Full-stack app: UI + persistence + memory pulled forward
**Call:** Architect.IQ is a full-stack application, not a skill emitting a static
artifact. Stack: React + TypeScript (Vite) frontend, FastAPI backend, SQLite
persistence (behind a repository interface, swappable to Postgres). The Python
engine remains the core, wrapped by the API. Estimates persist as versioned
Solution Graphs (every edit is a new version), enabling interactive editing.
Memory = reference-class retrieval (find similar past estimates to seed priors up
front) + pattern-prior tuning (past estimates and, later, actuals refine
parametric costs). The `PatternPrior` and actuals-ingestion extension points
become real components rather than stubs. Build sequence: full-stack skeleton
first (thin vertical slice across all layers), then deepen the estimation math.
**Why:** Owner confirmed on 2026-07-17 wanting drag-and-drop + manual context
entry, interactive estimates, persistence that improves over time, and feeding
prior estimates into memory to learn up front. This pulls Phase 4 (calibration)
and Phase 5 (hosted UI) forward and supersedes the §5 architecture decision and
the §5.3 "interactive artifact instead of an app" middle ground. Chosen via
explicit options: React+FastAPI / full-stack skeleton now / SQLite / retrieval +
prior tuning.

## D8. Pivot: architecture-first, workbook as calibration reference only
**Call:** Reorient Phase 1 around the Solution Graph (§4.3) as the central object,
with reference-architecture generation leading and effort/cost flowing from the
architecture. The workbook math (§2) is demoted from binding contract to
calibration reference: its t-shirt scale, ratios, and rates become defaults and a
sanity-check, but the engine does not replicate its exact formulas or treat the
xlsx as the primary deliverable. The pattern library (§4.2) is pulled forward
from Phase 2 to serve as the spine. Two-sided reconciliation (top-down pattern
cost vs bottom-up work-item rollup) is now in Phase 1 scope.
**Why:** Owner confirmed on 2026-07-17 that the workbook was a past constraint,
not the goal; the real objective is generating reference architectures, cost
models, and effort estimates from requirements plus client context. Owner chose
"reference & calibration only" for the workbook and "architecture-first (Solution
Graph)" as the Phase 1 center of gravity. This supersedes the original
build-order framing in the task brief (which said replicate §2 exactly first).
Step 1 domain models (WorkItem, complexity factors, phases, team, variables) are
retained; the flat EstimateModel is replaced by SolutionGraph.

## D7. Python toolchain via uv, Python 3.12
**Call:** Use `uv` to provide Python 3.12; system Python is 3.9.
**Why:** Spec requires Python 3.12 (§build constraints); only 3.9 is on the
machine and `uv` is available to pin 3.12 without touching system Python.
