import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { EstimateResponse } from "../types";
import { MermaidDiagram } from "./MermaidDiagram";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

function splitList(s: string): string[] {
  return s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
}

// Live editor: builds/updates the estimate automatically from whatever's entered
// and auto-saves in place — no "Generate" button.
export function NewEstimate({ onOpen }: { onOpen: (id: string) => void }) {
  const [projectName, setProjectName] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [opps, setOpps] = useState<{ id: string; name: string }[]>([]);
  const [prd, setPrd] = useState("");
  const [tech, setTech] = useState("");
  const [compliance, setCompliance] = useState("");
  const [skills, setSkills] = useState("");
  const [drag, setDrag] = useState(false);
  const [dropped, setDropped] = useState<string[]>([]);

  const [result, setResult] = useState<EstimateResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const estimateId = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);

  useEffect(() => {
    api.listOpportunities().then(setOpps).catch(() => {});
  }, []);

  // Debounced auto-build on any input change.
  useEffect(() => {
    if (!prd.trim()) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(build, 900);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prd, tech, compliance, skills, projectName, opportunityId]);

  async function build() {
    if (inflight.current || !prd.trim()) return;
    inflight.current = true;
    setStatus("saving");
    const body = {
      project_name: projectName || "Untitled",
      prd_text: prd,
      opportunity_id: opportunityId || null,
      client_context: { tech_stack: splitList(tech), compliance_posture: splitList(compliance), team_skills: splitList(skills) },
    };
    try {
      const resp = estimateId.current
        ? await api.rebuildEstimate(estimateId.current, body)
        : await api.createEstimate(body);
      estimateId.current = resp.estimate_id;
      setResult(resp);
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      inflight.current = false;
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const { filename, text } = await api.extractContext(file);
        setPrd((prev) => (prev ? prev + "\n\n" : "") + `# ${filename}\n${text}`);
        setDropped((d) => [...d, filename]);
      } catch {
        /* ignore */
      }
    }
  }

  const mc = result?.graph.monte_carlo;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div>
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="card-h mb-0">Estimate inputs</h2>
            <span className="ml-auto text-[12px] text-muted">
              {status === "saving" && "Estimating…"}
              {status === "saved" && "Saved ✓"}
              {status === "error" && <span className="text-brand-orange-deep">Save failed</span>}
              {status === "idle" && "Auto-builds as you type"}
            </span>
          </div>
          <label className="label">Project name</label>
          <input className="field" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Acme RAG Platform" />
          <label className="label">Opportunity (optional)</label>
          <select className="field" value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)}>
            <option value="">— none —</option>
            {opps.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <label className="label">PRD / feature list</label>
          <div
            className={"border-2 border-dashed rounded-xl p-6 text-center transition-colors " +
              (drag ? "border-brand-orange bg-orange-50 text-brand-orange" : "border-line text-muted bg-[#fdfcfb]")}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
          >
            Drag &amp; drop context — docs (.md, .txt, .docx, .pdf), data (.xlsx, .csv), or images
            <div className="mt-2"><input type="file" multiple accept=".md,.txt,.docx,.pdf,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.webp" onChange={(e) => handleFiles(e.target.files)} /></div>
          </div>
          {dropped.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">{dropped.map((d) => <span key={d} className="bg-stone-100 rounded-full px-2.5 py-0.5 text-xs text-muted">{d}</span>)}</div>
          )}
          <textarea className="field mt-2.5 min-h-[180px] resize-y" value={prd} onChange={(e) => setPrd(e.target.value)} placeholder="Start typing requirements — the estimate builds itself. One per line / bullet." />
        </div>
        <div className="card">
          <h2 className="card-h">Client context</h2>
          <label className="label">Tech stack</label>
          <input className="field" value={tech} onChange={(e) => setTech(e.target.value)} placeholder="Databricks, Python, React" />
          <label className="label">Compliance posture</label>
          <input className="field" value={compliance} onChange={(e) => setCompliance(e.target.value)} placeholder="SOC 2, HIPAA" />
          <label className="label">Team skills</label>
          <input className="field" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Spark, LLMs, .NET" />
        </div>
      </div>

      <div>
        {!result ? (
          <div className="card text-muted text-[14px]">
            The estimate appears here and updates live as you add requirements and context. Nothing to save manually.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="card"><div className="text-xs text-muted uppercase tracking-wide">Effort</div><div className="text-[22px] font-bold">{mc ? Math.round(mc.effort_points.p50) : "—"} <span className="text-sm text-muted">pts</span></div></div>
              <div className="card"><div className="text-xs text-muted uppercase tracking-wide">Duration</div><div className="text-[22px] font-bold">{mc ? mc.duration_sprints.p50.toFixed(1) : "—"} <span className="text-sm text-muted">spr</span></div></div>
              <div className="card"><div className="text-xs text-muted uppercase tracking-wide">Cost</div><div className="text-[22px] font-bold">{mc ? money(mc.cost.p50) : "—"}</div></div>
            </div>
            <div className="card">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="card-h mb-0">Reference architecture</h2>
                <span className="ml-auto badge bg-brand-mint text-brand-sage">{result.graph.matched_pattern_ids[0]}</span>
              </div>
              <MermaidDiagram code={result.mermaid} />
              <button className="btn btn-primary w-full mt-3" onClick={() => onOpen(result.estimate_id)}>
                Open full estimate — deal-shaping, scenarios, sharing
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
