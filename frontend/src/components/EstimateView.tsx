import { useState } from "react";
import { api } from "../api";
import type { EstimateResponse, Percentiles } from "../types";
import { MermaidDiagram } from "./MermaidDiagram";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const pts = (n: number) => `${Math.round(n)} pts`;

function Stat({ label, value, sub, range, fmt }: { label: string; value: string; sub?: string; range?: Percentiles; fmt?: (n: number) => string }) {
  return (
    <div className="card">
      <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
      <div className="text-[26px] font-bold tracking-tight">
        {value} {sub && <span className="text-sm font-medium text-muted">{sub}</span>}
      </div>
      {range && fmt && <div className="text-xs text-brand-green font-semibold mt-0.5">80% conf: {fmt(range.p10)} – {fmt(range.p80)}</div>}
    </div>
  );
}

export function EstimateView({ initial }: { initial: EstimateResponse }) {
  const [est, setEst] = useState(initial);
  const [aiBoost, setAiBoost] = useState(0);
  const [engineers, setEngineers] = useState(
    est.graph.team_plan.roles.filter((r) => r.discipline !== "Project & Program Management").length || 3
  );
  const [oralsMode, setOralsMode] = useState(false);
  const [busy, setBusy] = useState<null | "knobs" | "recost">(null);

  const g = est.graph;
  const mc = g.monte_carlo;
  const rec = g.reconciliation;

  async function applyKnobs() {
    setBusy("knobs");
    try {
      setEst(await api.recompute(est.estimate_id, { ai_boost: aiBoost, engineer_count: engineers }));
    } finally {
      setBusy(null);
    }
  }

  async function recost() {
    setBusy("recost");
    try {
      setEst(await api.recost(est.estimate_id));
    } finally {
      setBusy(null);
    }
  }

  const total = rec ? rec.top_down_points + rec.bottom_up_points : 0;
  const bottomPct = total ? (rec!.bottom_up_points / total) * 100 : 50;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h1 className="m-0 text-[22px] font-bold">{g.project_name}</h1>
        <span className="badge bg-orange-100 text-brand-orange">v{est.version}</span>
        {g.matched_pattern_ids.map((p) => <span key={p} className="badge bg-brand-mint text-brand-sage">{p}</span>)}
        <label className="ml-auto flex items-center gap-1.5 font-medium text-sm">
          <input type="checkbox" checked={oralsMode} onChange={(e) => setOralsMode(e.target.checked)} />
          Client-safe (hide pricing)
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Effort (P50)" value={mc ? pts(mc.effort_points.p50) : "—"} range={mc?.effort_points} fmt={pts} />
        <Stat label="Duration (P50)" value={mc ? mc.duration_sprints.p50.toFixed(1) : "—"} sub="sprints" range={mc?.duration_sprints} fmt={(n) => `${n.toFixed(1)} spr`} />
        {!oralsMode && <Stat label="Cost (P50)" value={mc ? money(mc.cost.p50) : "—"} range={mc?.cost} fmt={money} />}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-1">
        <div>
          <div className="card">
            <h2 className="card-h">Reference architecture <span className="normal-case tracking-normal text-muted">(Phase 1 sketch)</span></h2>
            <MermaidDiagram code={est.mermaid} />
          </div>

          {rec && (
            <div className="card">
              <h2 className="card-h">Top-down vs bottom-up</h2>
              <div className="flex items-center gap-3 text-[13px]">
                <span>Bottom-up <b>{pts(rec.bottom_up_points)}</b></span>
                <div className="flex-1 h-2 bg-stone-200 rounded overflow-hidden relative">
                  <div className="absolute h-full bg-brand-green" style={{ width: `${bottomPct}%` }} />
                </div>
                <span>Top-down <b>{pts(rec.top_down_points)}</b></span>
              </div>
              <p className="text-muted text-xs mb-0 mt-2">
                Divergence is the diagnostic: a large gap flags a missing pattern driver or an incomplete breakdown.
              </p>
            </div>
          )}
        </div>

        <div>
          <div className="card">
            <h2 className="card-h">Deal-shaping</h2>
            <div className="my-3.5">
              <div className="flex justify-between text-[13px] font-semibold">
                <span>AI boost <span className="text-[11px] font-bold text-brand-sage bg-brand-aurora px-1.5 rounded ml-1.5">AI</span></span>
                <span>{Math.round(aiBoost * 100)}%</span>
              </div>
              <input type="range" min={0} max={0.5} step={0.05} value={aiBoost} className="w-full accent-brand-green"
                onChange={(e) => setAiBoost(parseFloat(e.target.value))} onMouseUp={applyKnobs} onTouchEnd={applyKnobs} />
            </div>
            <div className="my-3.5">
              <div className="flex justify-between text-[13px] font-semibold"><span>Engineers</span><span>{engineers}</span></div>
              <input type="range" min={1} max={12} step={1} value={engineers} className="w-full accent-brand-orange"
                onChange={(e) => setEngineers(parseInt(e.target.value))} onMouseUp={applyKnobs} onTouchEnd={applyKnobs} />
            </div>
            <button className="btn mt-1" onClick={recost} disabled={busy !== null}>
              {busy === "recost" ? "Re-costing…" : "Re-cost with active rates"}
            </button>
            {busy === "knobs" && <div className="text-muted text-sm mt-2">Recomputing…</div>}
          </div>

          {!oralsMode && (
            <div className="card">
              <h2 className="card-h">Team plan {g.team_plan.monthly_cost != null && <span className="normal-case tracking-normal text-muted">· {money(g.team_plan.monthly_cost)}/mo</span>}</h2>
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="text-muted">
                    <th className="text-left py-1.5 px-2 border-b border-line uppercase text-[12px]">Discipline</th>
                    <th className="text-left py-1.5 px-2 border-b border-line uppercase text-[12px]">Tier</th>
                    <th className="text-left py-1.5 px-2 border-b border-line uppercase text-[12px]">Loc</th>
                    <th className="text-left py-1.5 px-2 border-b border-line uppercase text-[12px]">Day rate</th>
                  </tr>
                </thead>
                <tbody>
                  {g.team_plan.roles.map((r, i) => (
                    <tr key={i}>
                      <td className="py-1.5 px-2 border-b border-line">{r.discipline}</td>
                      <td className="py-1.5 px-2 border-b border-line">{r.tier}</td>
                      <td className="py-1.5 px-2 border-b border-line">{r.location}</td>
                      <td className="py-1.5 px-2 border-b border-line">{r.day_rate ? money(r.day_rate) : <span className="text-muted">n/a</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {est.references.length > 0 && (
            <div className="card">
              <h2 className="card-h">Reference class (memory)</h2>
              {est.references.map((r) => (
                <div key={r.estimate_id} className="text-[13px] py-2 border-b border-line last:border-0">
                  <b>{r.project_name}</b> <span className="text-brand-green font-semibold">{Math.round(r.similarity * 100)}%</span>
                  <div className="text-muted">{r.why}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="card-h">Assumptions &amp; rationale</h2>
        <ul className="m-0 pl-4 text-[13px] space-y-1">
          {g.assumptions.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      </div>
    </div>
  );
}
