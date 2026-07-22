"""LLM ingest and matching (spec §3.1-3.3), Anthropic-backed with fallback.

Three capabilities, each with a deterministic fallback so the engine runs offline:
- `extract_requirements`  — structured requirements from a PRD (vs line-based).
- `derive_capabilities`   — real higher-level capabilities and their links (vs 1:1).
- `rank_patterns`         — nuanced pattern match (vs signal-overlap scoring).

The client is injectable (`LLMClient` protocol) so the parsing/integration logic
is testable with a fake client and no network. `available()` reports whether a
real call is possible; callers fall back to heuristics when it is not, or on any
error. Structured replies are requested as JSON and defensively parsed.
"""

from __future__ import annotations

import json
import os
import re
from typing import Protocol

# Latest Claude model suited to extraction/reasoning at good latency/cost.
# Override with ARCHITECTIQ_LLM_MODEL.
DEFAULT_MODEL = "claude-sonnet-5"


class LLMClient(Protocol):
    def complete_json(self, system: str, user: str, *, max_tokens: int = 4000) -> dict: ...


def model_name() -> str:
    return os.environ.get("ARCHITECTIQ_LLM_MODEL", DEFAULT_MODEL)


def available() -> bool:
    """True when a real Anthropic call is possible.

    Requires ANTHROPIC_API_KEY and that ARCHITECTIQ_DISABLE_LLM is not set (an
    escape hatch to force the deterministic path even when a key is present).
    """
    if os.environ.get("ARCHITECTIQ_DISABLE_LLM", "").strip().lower() in {"1", "true", "yes"}:
        return False
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


class AnthropicClient:
    """Real client. Asks for a JSON object and parses it defensively."""

    def __init__(self, model: str | None = None):
        self.model = model or model_name()

    def complete_json(self, system: str, user: str, *, max_tokens: int = 4000) -> dict:
        import anthropic

        client = anthropic.Anthropic()
        message = client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system + "\n\nRespond with a single valid JSON object and nothing else.",
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(b.text for b in message.content if getattr(b, "type", None) == "text")
        return _parse_json_object(text)


def _parse_json_object(text: str) -> dict:
    """Extract and parse the first JSON object from a model reply."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("no JSON object found in model reply")
    return json.loads(match.group(0))


def _client(client: LLMClient | None) -> LLMClient:
    return client or AnthropicClient()


def extract_requirements(prd_text: str, *, client: LLMClient | None = None) -> list[dict]:
    """Return [{text, kind, confidence}] extracted from the PRD.

    kind is one of functional/non_functional/constraint; confidence is 0-1.
    """
    system = (
        "You are a senior delivery lead extracting requirements from a PRD for "
        "estimation. Consolidate bullets/prose into distinct, atomic requirements."
    )
    user = (
        "Extract the requirements from the following PRD. For each, give the text, "
        "a kind (functional | non_functional | constraint), and a confidence 0-1 "
        "reflecting how clearly the PRD states it.\n\n"
        'Return JSON: {"requirements": [{"text": str, "kind": str, "confidence": number}]}\n\n'
        f"PRD:\n{prd_text}"
    )
    data = _client(client).complete_json(system, user)
    return _parse_requirement_items(data)


def _parse_requirement_items(data: dict) -> list[dict]:
    out: list[dict] = []
    for r in data.get("requirements", []):
        text = str(r.get("text", "")).strip()
        if not text:
            continue
        kind = str(r.get("kind", "functional")).strip().lower()
        if kind not in {"functional", "non_functional", "constraint"}:
            kind = "functional"
        conf = r.get("confidence", 0.7)
        out.append({"text": text[:300], "kind": kind, "confidence": _clamp(conf)})
    return out


def _normalize_words(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def _is_duplicate(candidate: str, existing: list[str], threshold: float = 0.6) -> bool:
    """Word-overlap heuristic: True if `candidate` substantially restates an existing entry."""
    cand_words = _normalize_words(candidate)
    if not cand_words:
        return True
    for e in existing:
        e_words = _normalize_words(e)
        if not e_words:
            continue
        overlap = len(cand_words & e_words) / len(cand_words | e_words)
        if overlap >= threshold:
            return True
    return False


def extract_new_requirements(text: str, existing: list[str], *, client: LLMClient | None = None) -> list[dict]:
    """Decompose `text` (a dropped file or fetched URL) into atomic requirements,
    excluding anything that substantively duplicates an entry already in `existing`
    (e.g. what's already in the Context Panel's Requirements tab).

    Same [{text, kind, confidence}] shape as `extract_requirements`. A word-overlap
    filter runs as a final safety net even on the LLM path, in case a near-duplicate
    slips through the prompt.
    """
    existing_block = "\n".join(f"- {e}" for e in existing) if existing else "(none yet)"
    system = (
        "You are a senior delivery lead adding to an existing requirements list from a "
        "newly dropped document. Decompose the document into distinct, atomic "
        "requirements, and OMIT anything that substantively duplicates an existing "
        "requirement below — paraphrases and near-duplicates count as duplicates."
    )
    user = (
        f"Existing requirements already captured:\n{existing_block}\n\n"
        "Extract the NEW requirements from the following document that are not already "
        "covered above. For each, give the text, a kind (functional | non_functional | "
        "constraint), and a confidence 0-1.\n\n"
        'Return JSON: {"requirements": [{"text": str, "kind": str, "confidence": number}]}\n\n'
        f"Document:\n{text}"
    )
    data = _client(client).complete_json(system, user)
    items = _parse_requirement_items(data)
    return [it for it in items if not _is_duplicate(it["text"], existing)]


_BULLET = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+")


def heuristic_new_requirements(text: str, existing: list[str], max_items: int = 60) -> list[dict]:
    """Deterministic fallback for extract_new_requirements: line-split + dedup filter."""
    out: list[dict] = []
    for line in text.splitlines():
        stripped = _BULLET.sub("", line).strip()
        if len(stripped) < 10 or _is_duplicate(stripped, existing):
            continue
        out.append({"text": stripped[:300], "kind": "functional", "confidence": 0.5})
        if len(out) >= max_items:
            break
    return out


def rank_patterns(
    prd_text: str,
    tech_stack: list[str],
    patterns: list[dict],
    *,
    client: LLMClient | None = None,
) -> list[dict]:
    """Return [{pattern_id, score, rationale}] ranked best-first.

    `patterns` is [{id, name, when_to_use}]. Scores are 0-1.
    """
    catalog = "\n".join(f"- {p['id']}: {p['name']} — {p.get('when_to_use', '')}" for p in patterns)
    system = "You are a solutions architect matching a PRD to a reference architecture pattern."
    user = (
        "Given the PRD, client tech stack, and the candidate patterns, score each "
        "pattern 0-1 for fit and give a one-line rationale.\n\n"
        'Return JSON: {"matches": [{"pattern_id": str, "score": number, "rationale": str}]}\n\n'
        f"Tech stack: {', '.join(tech_stack) or 'unspecified'}\n\n"
        f"Patterns:\n{catalog}\n\nPRD:\n{prd_text}"
    )
    data = _client(client).complete_json(system, user)
    valid_ids = {p["id"] for p in patterns}
    out = [
        {"pattern_id": m["pattern_id"], "score": _clamp(m.get("score", 0)), "rationale": str(m.get("rationale", ""))}
        for m in data.get("matches", [])
        if m.get("pattern_id") in valid_ids
    ]
    out.sort(key=lambda m: m["score"], reverse=True)
    return out


def derive_capabilities(
    prd_text: str,
    requirement_texts: list[str],
    component_names: list[str],
    *,
    client: LLMClient | None = None,
) -> dict:
    """Derive higher-level capabilities and their links.

    Returns {capabilities: [{name, description}],
             requirement_links: [cap_index per requirement],
             component_links: {component_name: cap_index}}.
    """
    system = (
        "You are a business architect. Capabilities are what the system must be "
        "able to do, at a higher level than individual requirements or components."
    )
    user = (
        "From the PRD, requirements, and the proposed architecture components, "
        "derive 3-7 capabilities. Then map each requirement (by its index) to the "
        "capability it belongs to, and each component (by name) to the capability "
        "it realizes.\n\n"
        'Return JSON: {"capabilities": [{"name": str, "description": str}], '
        '"requirement_links": [int, ...], "component_links": {"<component name>": int}}\n\n'
        f"Requirements (indexed):\n"
        + "\n".join(f"{i}. {t}" for i, t in enumerate(requirement_texts))
        + f"\n\nComponents: {', '.join(component_names)}\n\nPRD:\n{prd_text}"
    )
    data = _client(client).complete_json(system, user)
    caps = [
        {"name": str(c.get("name", "")).strip(), "description": str(c.get("description", "")).strip()}
        for c in data.get("capabilities", [])
        if str(c.get("name", "")).strip()
    ]
    if not caps:
        raise ValueError("no capabilities derived")
    return {
        "capabilities": caps,
        "requirement_links": data.get("requirement_links", []),
        "component_links": data.get("component_links", {}),
    }


def suggest_team_models(
    context_summary: str,
    dev_models: list[str],
    history_summary: str,
    *,
    client: LLMClient | None = None,
) -> list[dict]:
    """Propose scenarios optimized to be cheaper or faster, grounded in history.

    Returns [{goal, name, dev_model, location_mix, engineers, rationale}].
    """
    system = (
        "You are a delivery strategist proposing alternative staffing/development "
        "models for a software estimate. Ground proposals in how similar past "
        "engagements actually performed when that history is provided."
    )
    user = (
        "Propose 2-4 scenarios, each optimized to be either cheaper or faster than "
        "the baseline, using the available development models and a location mix "
        "(US onshore, NS nearshore). Give each a short name, the dev_model, a "
        "location_mix (weights summing to 1), an optional engineers count, and a "
        "one-line rationale.\n\n"
        'Return JSON: {"suggestions": [{"goal": "cheaper|faster", "name": str, '
        '"dev_model": str, "location_mix": {"US": number, "NS": number}, '
        '"engineers": number|null, "rationale": str}]}\n\n'
        f"Available dev models: {', '.join(dev_models)}\n\n"
        f"Estimate summary:\n{context_summary}\n\n"
        f"Relevant history:\n{history_summary or 'none'}"
    )
    data = _client(client).complete_json(system, user)
    return data.get("suggestions", [])


def suggest_deferrals(work_items_summary: str, *, client: LLMClient | None = None) -> list[dict]:
    """Suggest features to defer to a later version to reduce time.

    Returns [{feature, rationale}] naming features from the provided list.
    """
    system = (
        "You are a product strategist identifying scope that could move to a later "
        "release to shorten the first delivery, preferring non-core or cross-cutting work."
    )
    user = (
        "From the feature list, suggest which to defer to a future version to cut "
        "delivery time, with a one-line rationale each. Only name features from the list.\n\n"
        'Return JSON: {"deferrals": [{"feature": str, "rationale": str}]}\n\n'
        f"Features:\n{work_items_summary}"
    )
    data = _client(client).complete_json(system, user)
    return data.get("deferrals", [])


def _clamp(value, lo: float = 0.0, hi: float = 1.0) -> float:
    try:
        return max(lo, min(hi, float(value)))
    except (TypeError, ValueError):
        return 0.5
