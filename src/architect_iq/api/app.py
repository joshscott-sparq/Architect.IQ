"""FastAPI app exposing the Architect.IQ engine (spec §5).

Endpoints back the React UI: create/list/get/edit estimates, list patterns,
extract dropped context files, recompute under deal-shaping knobs, and record
actuals for calibration.
"""

from __future__ import annotations

import io
import os

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .. import data_loader
from ..core import estimation
from ..core.recompute import RecomputeOverrides, recompute
from ..emit.mermaid import architecture_mermaid
from ..memory.priors import ActualOutcome
from ..memory.retrieval import Reference
from ..models.results import ClientContext
from ..models.scenario import Scenario
from ..models.solution_graph import SolutionGraph
from ..service import EstimateService

app = FastAPI(title="Architect.IQ", version="0.1.0")

# The Vite dev server origin; CORS_ORIGINS overrides in other environments.
_origins = os.environ.get("ARCHITECTIQ_CORS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

service = EstimateService(db_path=os.environ.get("ARCHITECTIQ_DB", "architect_iq.db"))


# --- Request/response models ---

class CreateEstimateRequest(BaseModel):
    project_name: str
    prd_text: str
    client_context: ClientContext = Field(default_factory=ClientContext)
    match_override: str | None = None


class EstimateResponse(BaseModel):
    estimate_id: str
    version: int
    graph: SolutionGraph
    mermaid: str
    references: list[Reference] = []


class ContextExtractResponse(BaseModel):
    filename: str
    text: str


def _to_response(estimate_id: str, version: int, graph: SolutionGraph, references: list[Reference] | None = None) -> EstimateResponse:
    return EstimateResponse(
        estimate_id=estimate_id,
        version=version,
        graph=graph,
        mermaid=architecture_mermaid(graph),
        references=references or [],
    )


# --- Endpoints ---

@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "version": app.version}


@app.get("/api/demo/status")
def demo_status() -> dict:
    """Whether demo data has been seeded, and how many estimates exist."""
    from ..demo import DEMO_SCENARIOS, is_seeded

    return {
        "seeded": is_seeded(service),
        "count": len(service.list_estimates()),
        "available": len(DEMO_SCENARIOS),
    }


@app.post("/api/demo/seed")
def demo_seed() -> dict:
    """Populate the store with curated demo estimates (idempotent by name)."""
    from ..demo import seed_demo

    return seed_demo(service)


@app.get("/api/patterns")
def list_patterns() -> list[dict]:
    patterns, version = data_loader.load_patterns()
    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "when_to_use": p.when_to_use,
            "match_signals": p.match_signals,
            "library_version": version,
        }
        for p in patterns.values()
    ]


@app.post("/api/context/extract", response_model=ContextExtractResponse)
async def extract_context(file: UploadFile = File(...)) -> ContextExtractResponse:
    """Extract text from a dropped context file for the UI.

    Supported: .docx, .xlsx, .csv, .pdf, images (.png/.jpg/.jpeg/.gif/.webp), and
    plain text (.md/.txt). Spreadsheets flatten to readable rows; PDFs extract
    text; images are transcribed via Claude vision (requirements or architecture
    diagrams) when an API key is set.
    """
    raw = await file.read()
    name = file.filename or "upload"
    lower = name.lower()
    try:
        if lower.endswith(".docx"):
            text = _extract_docx(raw)
        elif lower.endswith(".xlsx"):
            text = _extract_xlsx(raw)
        elif lower.endswith(".csv"):
            text = _extract_csv(raw)
        elif lower.endswith(".pdf"):
            text = _extract_pdf(raw)
        elif _image_media_type(lower):
            from ..core.vision import describe_image

            text = describe_image(raw, _image_media_type(lower))
        else:
            text = raw.decode("utf-8", errors="replace")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"could not parse {name}: {exc}")
    return ContextExtractResponse(filename=name, text=text)


_IMAGE_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


def _image_media_type(lower_name: str) -> str | None:
    for ext, media in _IMAGE_TYPES.items():
        if lower_name.endswith(ext):
            return media
    return None


def _extract_pdf(raw: bytes, max_pages: int = 100) -> str:
    """Extract text from a PDF (requirements docs). Falls back to a note if the
    PDF is scanned/image-only with no extractable text (use image drop instead)."""
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(raw))
    pages = []
    for i, page in enumerate(reader.pages):
        if i >= max_pages:
            pages.append(f"... (truncated at {max_pages} pages)")
            break
        pages.append(page.extract_text() or "")
    text = "\n".join(p.strip() for p in pages if p.strip())
    if not text.strip():
        return (
            "> PDF has no extractable text (likely scanned). Drop it as an image "
            "to use vision extraction instead.\n"
        )
    return text


def _extract_docx(raw: bytes) -> str:
    import docx  # python-docx

    document = docx.Document(io.BytesIO(raw))
    return "\n".join(p.text for p in document.paragraphs)


def _extract_xlsx(raw: bytes, max_rows_per_sheet: int = 500) -> str:
    """Flatten an .xlsx to text: one section per sheet, cells joined by ' | '."""
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    blocks: list[str] = []
    for ws in wb.worksheets:
        lines = [f"## Sheet: {ws.title}"]
        truncated = False
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            if i >= max_rows_per_sheet:
                truncated = True
                break
            cells = [str(c) for c in row if c is not None and str(c).strip()]
            if cells:
                lines.append(" | ".join(cells))
        if truncated:
            lines.append(f"... (truncated at {max_rows_per_sheet} rows)")
        if len(lines) > 1:
            blocks.append("\n".join(lines))
    wb.close()
    return "\n\n".join(blocks)


def _extract_csv(raw: bytes, max_rows: int = 2000) -> str:
    """Normalize a .csv to ' | '-joined rows (handles quoting/delimiters)."""
    import csv

    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(text))
    lines: list[str] = []
    for i, row in enumerate(reader):
        if i >= max_rows:
            lines.append(f"... (truncated at {max_rows} rows)")
            break
        cells = [c.strip() for c in row if c.strip()]
        if cells:
            lines.append(" | ".join(cells))
    return "\n".join(lines)


@app.post("/api/estimates", response_model=EstimateResponse)
def create_estimate(req: CreateEstimateRequest) -> EstimateResponse:
    if not req.prd_text.strip():
        raise HTTPException(status_code=422, detail="prd_text is required")
    stored, references = service.create_estimate(
        req.project_name or "Untitled", req.prd_text, req.client_context, req.match_override
    )
    return _to_response(stored.estimate_id, stored.version, stored.graph, references)


@app.get("/api/estimates")
def list_estimates() -> list[dict]:
    return [s.__dict__ for s in service.list_estimates()]


@app.get("/api/estimates/{estimate_id}", response_model=EstimateResponse)
def get_estimate(estimate_id: str, version: int | None = None) -> EstimateResponse:
    stored = service.get_estimate(estimate_id, version)
    if stored is None:
        raise HTTPException(status_code=404, detail="estimate not found")
    return _to_response(stored.estimate_id, stored.version, stored.graph)


@app.post("/api/estimates/{estimate_id}/recompute", response_model=EstimateResponse)
def recompute_estimate(estimate_id: str, overrides: RecomputeOverrides) -> EstimateResponse:
    """Apply deal-shaping knobs and persist the result as a new version (§5.5)."""
    stored = service.get_estimate(estimate_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="estimate not found")
    updated_graph = recompute(stored.graph, overrides)
    saved = service.update_estimate(estimate_id, updated_graph)
    return _to_response(saved.estimate_id, saved.version, saved.graph)


@app.put("/api/estimates/{estimate_id}", response_model=EstimateResponse)
def update_estimate(estimate_id: str, graph: SolutionGraph) -> EstimateResponse:
    """Persist a fully edited graph as a new version (interactive editing)."""
    if service.get_estimate(estimate_id) is None:
        raise HTTPException(status_code=404, detail="estimate not found")
    saved = service.update_estimate(estimate_id, graph)
    return _to_response(saved.estimate_id, saved.version, saved.graph)


@app.get("/api/rates")
def get_rates() -> dict:
    """The active rate card: rows + source + summary (leverage modeling, §2.6)."""
    from ..core.rates import RateCard

    rows, source = service.active_rates()
    return {
        "source": source,
        "summary": RateCard(rows).summary(),
        "rates": [
            {"discipline": r.discipline, "tier": r.tier, "location": r.location.value, "day_rate": r.day_rate}
            for r in rows
        ],
    }


def _card_dict(card, include_rows: bool = False) -> dict:
    from ..core.rates import RateCard

    out = {
        "id": card.id,
        "name": card.name,
        "is_default": card.is_default,
        "is_active": card.is_active,
        "summary": RateCard(card.rows).summary(),
    }
    if include_rows:
        out["rates"] = [
            {"discipline": r.discipline, "tier": r.tier, "location": r.location.value, "day_rate": r.day_rate}
            for r in card.rows
        ]
    return out


@app.get("/api/rate-cards")
def list_rate_cards() -> list[dict]:
    """All saved rate cards (one active, one default)."""
    return [_card_dict(c) for c in service.list_rate_cards()]


@app.post("/api/rate-cards")
async def create_rate_card(file: UploadFile = File(...), name: str = Form(None)) -> dict:
    """Save a rate card from a file (.csv/.xlsx/.yaml) and make it active."""
    from ..core.rates import parse_rate_file

    raw = await file.read()
    try:
        rows = parse_rate_file(raw, file.filename or "rates")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    card = service.create_rate_card(name or (file.filename or "Rate card"), rows)
    return _card_dict(card, include_rows=True)


@app.post("/api/rate-cards/{card_id}/activate")
def activate_rate_card(card_id: str) -> dict:
    try:
        return _card_dict(service.activate_rate_card(card_id), include_rows=True)
    except KeyError:
        raise HTTPException(status_code=404, detail="rate card not found")


@app.delete("/api/rate-cards/{card_id}")
def delete_rate_card(card_id: str) -> dict:
    try:
        service.delete_rate_card(card_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="rate card not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "deleted", "id": card_id}


@app.post("/api/estimates/{estimate_id}/recost", response_model=EstimateResponse)
def recost_estimate(estimate_id: str) -> EstimateResponse:
    """Reprice an existing estimate under the active rate card (new version)."""
    try:
        saved = service.recost_estimate(estimate_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="estimate not found")
    return _to_response(saved.estimate_id, saved.version, saved.graph)


@app.get("/api/dev-models")
def list_dev_models() -> list[dict]:
    models, _ = data_loader.load_dev_models()
    return [
        {"key": k, "name": m["name"], "ai_boost": m["ai_boost"],
         "effort_multiplier": m["effort_multiplier"], "assumptions": m.get("assumptions", [])}
        for k, m in models.items()
    ]


class ScenariosRequest(BaseModel):
    scenarios: list[Scenario] | None = None


@app.post("/api/estimates/{estimate_id}/scenarios", response_model=EstimateResponse)
def compute_scenarios_endpoint(estimate_id: str, req: ScenariosRequest) -> EstimateResponse:
    """Compute staffing/dev-model scenarios (defaults if none given) and persist."""
    try:
        saved = service.compute_scenarios(estimate_id, req.scenarios)
    except KeyError:
        raise HTTPException(status_code=404, detail="estimate not found")
    return _to_response(saved.estimate_id, saved.version, saved.graph)


@app.post("/api/estimates/{estimate_id}/suggestions")
def suggestions_endpoint(estimate_id: str) -> dict:
    """Advisor: cheaper/faster team models and scope deferrals (history-grounded)."""
    try:
        result = service.suggest(estimate_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="estimate not found")
    return {
        "team": [t.model_dump() for t in result["team"]],
        "deferrals": [d.model_dump() for d in result["deferrals"]],
    }


@app.post("/api/estimates/{estimate_id}/actuals")
def record_actuals(estimate_id: str, outcome: ActualOutcome) -> dict:
    if service.get_estimate(estimate_id) is None:
        raise HTTPException(status_code=404, detail="estimate not found")
    outcome.estimate_id = estimate_id
    service.record_actuals(outcome)
    return {"status": "recorded", "estimate_id": estimate_id}
