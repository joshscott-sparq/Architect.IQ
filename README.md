# Architect.IQ

Agentic estimation and solutioning engine. Takes a PRD plus client context (tech
stack, compliance posture, team skills) and produces a reference architecture,
effort estimate, and cost model — compressing the discovery-to-SOW cycle.

Built architecture-first around a **Solution Graph**
(`requirements → capabilities → components → work items → effort → team → cost`):
every artifact is a projection of one object. See
[`architect-iq-context.md`](architect-iq-context.md) for the spec and
[`DECISIONS.md`](DECISIONS.md) for judgment calls.

> **Status: Phase 1.** Full-stack app; the vertical slice runs end to end. The
> estimation math is real (PERT, PERT-beta Monte Carlo, top-down/bottom-up
> reconciliation, pattern-prior calibration); several ingest/sizing steps are
> skeleton-depth and marked for deepening (see DECISIONS.md D11).

## Features

- **Architecture-first estimates** — PRD + client context matched to a reference
  pattern (RAG on Databricks, .NET modernization, agentic-on-MCP), instantiated
  into components, work items, effort, team, and cost.
- **Context ingestion** — drag-and-drop or paste. Handles `.md/.txt`, `.docx`,
  `.pdf`, `.xlsx`, `.csv`, and images (Claude vision when `ANTHROPIC_API_KEY` is set).
- **Monte Carlo ranges** — P10/P50/P80/P90 for effort, duration, and cost.
- **Two-sided reconciliation** — top-down parametric vs bottom-up rollup; divergence is the diagnostic.
- **Interactive deal-shaping** — AI-boost and team sliders recompute live; every edit is a new version.
- **Loadable rate cards** — upload roles-and-rates (CSV/XLSX/YAML) to model a
  leverage model and re-cost estimates. Examples in [`examples/`](examples/).
- **Memory** — reference-class retrieval surfaces similar past estimates; pattern
  priors self-tune from past estimates and recorded actuals.
- **Client-safe mode** — hide pricing for orals.
- **Demo mode** — `npm run demo` auto-loads curated sample data covering every feature.

## Architecture

| Layer | Location | What it does |
|-------|----------|--------------|
| Core engine | `src/architect_iq/core/` | matcher, estimation, Monte Carlo, recompute, rates, vision |
| Models | `src/architect_iq/models/` | Solution Graph nodes/edges, work items, patterns |
| Data (versioned) | `src/architect_iq/data/` | t-shirt scale, variables, complexity factors, patterns, pricing |
| Persistence | `src/architect_iq/persistence/` | SQLite, versioned Solution Graphs |
| Memory | `src/architect_iq/memory/` | reference-class retrieval + pattern-prior tuning |
| Demo | `src/architect_iq/demo.py` | curated sample data seeding |
| API | `src/architect_iq/api/` | FastAPI |
| Frontend | `frontend/` | React + TypeScript + Tailwind (Vite) |

## Run it

Backend (Python 3.12; this repo uses [`uv`](https://docs.astral.sh/uv/)):

```bash
uv venv --python 3.12
uv pip install -e ".[dev]"
.venv/bin/python -m uvicorn architect_iq.api.app:app --port 8000 --reload
```

Frontend (proxies `/api` to `:8000`):

```bash
cd frontend
npm install
npm run dev     # normal app
npm run demo    # demo mode: auto-loads sample data, exercises every feature
npm run prod    # production build + preview
```

Tests:

```bash
.venv/bin/python -m pytest -q
```

## Pricing

Real day rates are **never committed**. `src/architect_iq/data/pricing.local.yaml`
(gitignored) holds real rates; `pricing.example.yaml` ships placeholder rates so
the engine runs out of the box. At runtime you can also upload a rate card in the
**Rates** tab. Schema in [`data/SCHEMA.md`](src/architect_iq/data/SCHEMA.md).

## Not yet built (later phases)

LLM-backed ingest/matching (beyond the vision path), the `architectiq` CLI, the
xlsx/summary emitters, the skill wrapper, and the deepened estimation math
(DECISIONS.md D11).
