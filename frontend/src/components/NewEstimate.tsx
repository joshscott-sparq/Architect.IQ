import { useEffect, useState } from "react";
import { api } from "../api";
import type { EstimateResponse } from "../types";

function splitList(s: string): string[] {
  return s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
}

export function NewEstimate({ onCreated }: { onCreated: (e: EstimateResponse) => void }) {
  const [projectName, setProjectName] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [opps, setOpps] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api.listOpportunities().then(setOpps).catch(() => {});
  }, []);
  const [prd, setPrd] = useState("");
  const [tech, setTech] = useState("");
  const [compliance, setCompliance] = useState("");
  const [skills, setSkills] = useState("");
  const [drag, setDrag] = useState(false);
  const [dropped, setDropped] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const { filename, text } = await api.extractContext(file);
        setPrd((prev) => (prev ? prev + "\n\n" : "") + `# ${filename}\n${text}`);
        setDropped((d) => [...d, filename]);
      } catch (e) {
        setError(String(e));
      }
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const resp = await api.createEstimate({
        project_name: projectName,
        prd_text: prd,
        opportunity_id: opportunityId || null,
        client_context: {
          tech_stack: splitList(tech),
          compliance_posture: splitList(compliance),
          team_skills: splitList(skills),
        },
      });
      onCreated(resp);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div>
        <div className="card">
          <h2 className="card-h">Requirements</h2>
          <label className="label">Project name</label>
          <input className="field" type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Acme RAG Platform" />
          <label className="label">Opportunity (optional)</label>
          <select className="field" value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)}>
            <option value="">— none —</option>
            {opps.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <label className="label">PRD / feature list</label>
          <div
            className={
              "border-2 border-dashed rounded-xl p-7 text-center transition-colors " +
              (drag ? "border-brand-orange bg-orange-50 text-brand-orange" : "border-line text-muted bg-[#fdfcfb]")
            }
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
          >
            Drag &amp; drop context — docs (.md, .txt, .docx, .pdf), data (.xlsx, .csv), or images (.png, .jpg)
            <div className="mt-2">
              <input type="file" multiple accept=".md,.txt,.docx,.pdf,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.webp" onChange={(e) => handleFiles(e.target.files)} />
            </div>
          </div>
          {dropped.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {dropped.map((d) => (
                <span key={d} className="bg-stone-100 rounded-full px-2.5 py-0.5 text-xs text-muted">{d}</span>
              ))}
            </div>
          )}
          <textarea className="field mt-2.5 min-h-[220px] resize-y" value={prd} onChange={(e) => setPrd(e.target.value)} placeholder="Or paste requirements. One per line / bullet." />
        </div>
      </div>

      <div>
        <div className="card">
          <h2 className="card-h">Client context</h2>
          <p className="text-[13px] text-muted mt-0">
            Compliance maps to the Sec &amp; Compliance factor; tech stack and skills feed pattern matching and discipline assignment.
          </p>
          <label className="label">Tech stack</label>
          <input className="field" type="text" value={tech} onChange={(e) => setTech(e.target.value)} placeholder="Databricks, Python, React" />
          <label className="label">Compliance posture</label>
          <input className="field" type="text" value={compliance} onChange={(e) => setCompliance(e.target.value)} placeholder="SOC 2, HIPAA" />
          <label className="label">Team skills</label>
          <input className="field" type="text" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Spark, LLMs, .NET" />
        </div>
        <button className="btn btn-primary w-full py-3" disabled={busy || !prd.trim()} onClick={submit}>
          {busy ? "Estimating…" : "Generate estimate"}
        </button>
        {error && <div className="text-brand-orange-deep text-[13px] mt-2">{error}</div>}
      </div>
    </div>
  );
}
