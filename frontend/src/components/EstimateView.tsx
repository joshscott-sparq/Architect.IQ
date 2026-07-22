import { useEffect, useState } from "react";
import { api } from "../api";
import type { AiTier, DeferralSuggestion, EstimateResponse, Percentiles, TeamSuggestion } from "../types";
import { MermaidDiagram } from "./MermaidDiagram";
import { Section } from "./Section";
import { ShareControls } from "./ShareControls";
import { CommentsSection } from "./CommentsSection";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

// Dummy Salesforce link — real org/instance wiring is a later integration step.
const sfUrl = (kind: "Account" | "Opportunity", sfId: string) => `https://sparq.my.salesforce.com/lightning/r/${kind}/${sfId}/view`;
const pts = (n: number) => `${Math.round(n)} pts`;
const fmtPts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const TH = "text-left py-1.5 px-2 border-b border-line uppercase text-[12px]";
const TD = "py-1.5 px-2 border-b border-line";

function Stat({ label, value, sub, range, fmt }: { label: string; value: string; sub?: string; range?: Percentiles; fmt?: (n: number) => string }) {
  return (
    <div className="card mb-0">
      <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
      <div className="text-[26px] font-bold tracking-tight">{value} {sub && <span className="text-sm font-medium text-muted">{sub}</span>}</div>
      {range && fmt && <div className="text-xs text-brand-green font-semibold mt-0.5">80% conf: {fmt(range.p10)} – {fmt(range.p80)}</div>}
    </div>
  );
}

function TagBar({ tags, canEdit, onChange }: { tags: string[]; canEdit: boolean; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState("");
  function add() {
    const t = input.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput("");
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap mb-4">
      <span className="text-[12px] text-muted uppercase tracking-wide mr-1">Tags</span>
      {tags.map((t) => (
        <span key={t} className="badge bg-brand-mint text-brand-sage">
          {t}
          {canEdit && <button className="ml-1 text-muted hover:text-brand-orange-deep" onClick={() => onChange(tags.filter((x) => x !== t))}>×</button>}
        </span>
      ))}
      {tags.length === 0 && !canEdit && <span className="text-muted text-[12px]">none</span>}
      {canEdit && (
        <input className="field !w-32 !py-1 text-[12px]" placeholder="add tag…" value={input}
          onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} onBlur={add} />
      )}
    </div>
  );
}

export function EstimateView({ initial, canEdit = true, canComment = true, canClone = false, isPublic = false, account, opportunity, onClone }: {
  initial: EstimateResponse; canEdit?: boolean; canComment?: boolean; canClone?: boolean; isPublic?: boolean;
  account?: { name: string; sfId?: string | null };
  opportunity?: { name: string; sfId?: string | null };
  onClone?: (id: string) => void;
}) {
  const readOnly = !canEdit;
  const [est, setEst] = useState(initial);
  const [aiBoost, setAiBoost] = useState(0);
  const [tiers, setTiers] = useState<AiTier[]>([]);
  const [tierKey, setTierKey] = useState<string | null>(null);
  const [engineers, setEngineers] = useState(est.graph.team_plan.roles.filter((r) => r.discipline !== "Project & Program Management").length || 3);

  useEffect(() => {
    api.listAiTiers().then((ts) => {
      setTiers(ts);
      const match = ts.find((t) => t.ai_boost === aiBoost) ?? ts[0];
      if (match) setTierKey(match.key);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [oralsMode, setOralsMode] = useState(false);
  const [busy, setBusy] = useState<null | "knobs" | "recost" | "scenarios" | "suggest" | "clone">(null);
  const [team, setTeam] = useState<TeamSuggestion[] | null>(null);
  const [deferrals, setDeferrals] = useState<DeferralSuggestion[] | null>(null);
  const [showShare, setShowShare] = useState(false);

  const g = est.graph;
  const mc = g.monte_carlo;
  const rec = g.reconciliation;
  const scenarios = g.scenarios ?? [];

  async function applyKnobs(boost = aiBoost) { setBusy("knobs"); try { setEst(await api.recompute(est.estimate_id, { ai_boost: boost, engineer_count: engineers })); } finally { setBusy(null); } }
  function selectTier(t: AiTier) { setTierKey(t.key); setAiBoost(t.ai_boost); applyKnobs(t.ai_boost); }
  async function recost() { setBusy("recost"); try { setEst(await api.recost(est.estimate_id)); } finally { setBusy(null); } }
  async function compareScenarios() { setBusy("scenarios"); try { setEst(await api.computeScenarios(est.estimate_id)); } finally { setBusy(null); } }
  async function loadSuggestions() { setBusy("suggest"); try { const s = await api.suggestions(est.estimate_id); setTeam(s.team); setDeferrals(s.deferrals); } finally { setBusy(null); } }
  async function clone() { setBusy("clone"); try { const c = await api.cloneEstimate(est.estimate_id); onClone?.(c.estimate_id); } finally { setBusy(null); } }
  async function setTags(tags: string[]) { setEst(await api.setTags(est.estimate_id, tags)); }

  const total = rec ? rec.top_down_points + rec.bottom_up_points : 0;
  const bottomPct = total ? (rec!.bottom_up_points / total) * 100 : 50;

  return (
    <div>
      {/* Header with sharing at the top (Google-Drive style) */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h1 className="m-0 text-[22px] font-bold">{g.project_name}</h1>
        <span className="badge bg-brand-orange/15 text-brand-orange">v{est.version}</span>
        {g.matched_pattern_ids.map((p) => <span key={p} className="badge bg-brand-mint text-brand-sage">{p}</span>)}
        {account && (
          account.sfId
            ? <a href={sfUrl("Account", account.sfId)} target="_blank" rel="noreferrer" className="badge bg-orange-100 text-brand-orange hover:underline" title="Open Account in Salesforce">{account.name} ↗</a>
            : <span className="badge bg-orange-100 text-brand-orange">{account.name}</span>
        )}
        {opportunity && (
          opportunity.sfId
            ? <a href={sfUrl("Opportunity", opportunity.sfId)} target="_blank" rel="noreferrer" className="badge bg-orange-100 text-brand-orange hover:underline" title="Open Opportunity in Salesforce">{opportunity.name} ↗</a>
            : <span className="badge bg-orange-100 text-brand-orange">{opportunity.name}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {canEdit && (
            <div className="relative">
              <button className="btn btn-primary text-[13px]" onClick={() => setShowShare((s) => !s)}>Share</button>
              {showShare && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowShare(false)} />
                  <div className="absolute right-0 mt-1 z-20 bg-surface border border-line rounded-xl p-4 shadow-xl">
                    <ShareControls estimateId={est.estimate_id} />
                  </div>
                </>
              )}
            </div>
          )}
          {canClone && <button className="btn text-[13px]" onClick={clone} disabled={busy !== null}>{busy === "clone" ? "Cloning…" : "Clone"}</button>}
          <label className="flex items-center gap-1.5 font-medium text-sm"><input type="checkbox" checked={oralsMode} onChange={(e) => setOralsMode(e.target.checked)} /> Client-safe</label>
        </div>
      </div>

      <TagBar tags={g.tags ?? []} canEdit={canEdit} onChange={setTags} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-1">
        <Stat label="Effort" value={mc ? pts(mc.effort_points.p50) : "—"} range={mc?.effort_points} fmt={pts} />
        <Stat label="Duration" value={mc ? mc.duration_sprints.p50.toFixed(1) : "—"} sub="sprints" range={mc?.duration_sprints} fmt={(n) => `${n.toFixed(1)} spr`} />
        {!oralsMode && <Stat label="Cost" value={mc ? money(mc.cost.p50) : "—"} range={mc?.cost} fmt={money} />}
      </div>
      <p className="text-muted text-[11px] mt-1 mb-5">
        Each number is the P50 (median) from the Monte Carlo simulation — the point where half of simulated
        outcomes land above and half below. The range beneath it is the 80% confidence band (P10–P80).
      </p>

      {/* Output panels — balanced masonry columns fill cohesively (no dead space); one column on mobile. */}
      <div className="columns-1 lg:columns-2 gap-5 [&>*]:break-inside-avoid">
        <Section title={<>Reference architecture <span className="normal-case tracking-normal text-muted">(Phase 1 sketch)</span></>}>
          <MermaidDiagram code={est.mermaid} />
        </Section>

        {!readOnly && (
          <Section title="Deal-shaping" expandable={false}>
            <div className="my-1">
              <div className="flex justify-between text-[13px] font-semibold"><span>AI Tier <span className="text-[11px] font-bold text-brand-sage bg-brand-aurora px-1.5 rounded ml-1.5">AI</span></span><span>{Math.round(aiBoost * 100)}% boost</span></div>
              <div className="flex gap-1.5 mt-1.5">
                {tiers.map((t) => (
                  <button key={t.key} className={"flex-1 py-1.5 rounded-lg text-[13px] font-semibold border " + (tierKey === t.key ? "bg-brand-green text-white border-brand-green" : "border-line text-muted hover:text-ink")}
                    onClick={() => selectTier(t)} disabled={busy !== null} title={`${t.human_role} · AI: ${t.ai_role}`}>
                    {t.tier}
                  </button>
                ))}
              </div>
              {tierKey && (() => {
                const t = tiers.find((x) => x.key === tierKey);
                return t ? <p className="text-muted text-[12px] mt-1.5 mb-0">1 human : {t.ai_ratio} AI — {t.human_role} · AI: {t.ai_role}</p> : null;
              })()}
            </div>
            <div className="my-2">
              <div className="flex justify-between text-[13px] font-semibold"><span>Engineers</span><span>{engineers}</span></div>
              <input type="range" min={1} max={12} step={1} value={engineers} className="w-full accent-brand-orange" onChange={(e) => setEngineers(parseInt(e.target.value))} onMouseUp={() => applyKnobs()} onTouchEnd={() => applyKnobs()} />
            </div>
            <button className="btn w-full mt-1" onClick={recost} disabled={busy !== null}>{busy === "recost" ? "Re-costing…" : "Re-cost with active rates"}</button>
            {busy === "knobs" && <div className="text-muted text-sm mt-2">Recomputing…</div>}
          </Section>
        )}

        {rec && (
          <Section title="Top-down vs bottom-up">
            <div className="flex items-center gap-3 text-[13px]">
              <span>Bottom-up <b>{pts(rec.bottom_up_points)}</b></span>
              <div className="flex-1 h-2 bg-line rounded overflow-hidden relative"><div className="absolute h-full bg-brand-green" style={{ width: `${bottomPct}%` }} /></div>
              <span>Top-down <b>{pts(rec.top_down_points)}</b></span>
            </div>
            {rec.blended_points != null && <p className="text-[13px] mt-2 mb-0">Blended (confidence-weighted): <b>{pts(rec.blended_points)}</b></p>}
            <p className="text-muted text-xs mb-0 mt-1">Divergence widens the range; the blend is the working number.</p>
          </Section>
        )}

        {g.work_items.length > 0 && (() => {
          const parentIds = new Set(g.work_items.map((w) => w.parent_id).filter(Boolean));
          const total = g.work_items.filter((w) => !parentIds.has(w.id)).reduce((sum, w) => sum + w.points.realistic, 0);
          return (
            <Section title={<>Estimate <span className="normal-case tracking-normal text-muted">(work breakdown)</span></>} defaultOpen={false}>
              <p className="text-muted text-[12px] mt-0 mb-2">
                Generated from context — the same requirements/risks/accelerators driving the numbers above.
                Refine the Context panel below to change it; this table isn't hand-edited directly.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead><tr className="text-muted"><th className={TH}>Item</th><th className={TH}>Pts (R)</th><th className={TH}>O–P</th><th className={TH}>Practice</th></tr></thead>
                  <tbody>
                    {g.work_items.map((wi) => (
                      <tr key={wi.id}>
                        <td className={TD + (wi.level === "story" ? " pl-6" : "")}>{wi.story ?? wi.feature ?? wi.epic}</td>
                        <td className={TD}>{fmtPts(wi.points.realistic)}</td>
                        <td className={TD + " text-muted"}>{fmtPts(wi.points.optimistic ?? wi.points.realistic)}–{fmtPts(wi.points.pessimistic ?? wi.points.realistic)}</td>
                        <td className={TD + " text-muted"}>{wi.practice ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold"><td className={TD}>Total</td><td className={TD}>{pts(total)}</td><td className={TD}></td><td className={TD}></td></tr>
                  </tfoot>
                </table>
              </div>
            </Section>
          );
        })()}

        {(() => {
          // Factors sourced from Context Panel risk entries (family "Risk: ...")
          // are already shown there — don't duplicate them in the output.
          const complexity = (g.complexity_factors ?? []).filter((f) => !f.family.startsWith("Risk: "));
          if (complexity.length === 0) return null;
          return (
            <Section title="Complexity factors" defaultOpen={false}>
              <p className="text-muted text-[12px] mt-0 mb-2">Derived from context; each reduces velocity and widens the range. Risks entered in the Context panel below drive the estimate too — see the Risks tab there.</p>
              {complexity.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-[13px] py-1 border-b border-line last:border-0">
                  <span className="flex-1">{f.family}</span>
                  <span className="badge bg-brand-mint text-brand-sage">{f.severity}</span>
                  <span className="text-brand-orange-deep font-semibold w-12 text-right">{f.impact.toFixed(2)}</span>
                </div>
              ))}
            </Section>
          );
        })()}

        {(scenarios.length > 0 || !readOnly) && (
          <Section title="Staffing & development scenarios" actions={!readOnly ? <button className="btn text-[13px]" onClick={compareScenarios} disabled={busy !== null}>{busy === "scenarios" ? "Computing…" : "Compare models"}</button> : undefined}>
            {scenarios.length === 0 ? (
              <p className="text-muted text-[13px] m-0">Compare AI Tiers (1-5) and US / nearshore / blended staffing on the same scope.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead><tr className="text-muted"><th className={TH}>Scenario</th><th className={TH}>Effort</th><th className={TH}>Duration</th>{!oralsMode && <th className={TH}>Cost</th>}</tr></thead>
                  <tbody>{scenarios.map((s) => (<tr key={s.scenario.id}><td className={TD}>{s.scenario.name}<div className="text-muted text-[11px]">{s.assumptions[0]}</div></td><td className={TD}>{pts(s.effort_points.p50)}</td><td className={TD}>{s.duration_sprints.p50.toFixed(1)} spr</td>{!oralsMode && <td className={TD}>{money(s.cost.p50)}</td>}</tr>))}</tbody>
                </table>
                <p className="text-muted text-[11px] mt-1.5 mb-0">Figures are each scenario's P50 (median) estimate.</p>
              </div>
            )}
          </Section>
        )}

        {est.references.length > 0 && (
          <Section title="Reference class (memory)" defaultOpen={false}>
            {est.references.map((r) => (<div key={r.estimate_id} className="text-[13px] py-2 border-b border-line last:border-0"><b>{r.project_name}</b> <span className="text-brand-green font-semibold">{Math.round(r.similarity * 100)}%</span><div className="text-muted">{r.why}</div></div>))}
          </Section>
        )}

        {!oralsMode && (
          <Section title={<>Team plan {g.team_plan.monthly_cost != null && <span className="normal-case tracking-normal text-muted">· {money(g.team_plan.monthly_cost)}/mo</span>}</>} defaultOpen={false}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead><tr className="text-muted"><th className={TH}>Discipline</th><th className={TH}>Tier</th><th className={TH}>Loc</th><th className={TH}>Day rate</th></tr></thead>
                <tbody>{g.team_plan.roles.map((r, i) => (<tr key={i}><td className={TD}>{r.discipline}</td><td className={TD}>{r.tier}</td><td className={TD}>{r.location}</td><td className={TD}>{r.day_rate ? money(r.day_rate) : <span className="text-muted">n/a</span>}</td></tr>))}</tbody>
              </table>
            </div>
          </Section>
        )}

        {tiers.length > 0 && (
          <Section title="AI Tiers — human-to-AI ratio" defaultOpen={false}>
            <p className="text-muted text-[12px] mt-0 mb-2">Reference for the Deal-shaping AI Tier selector above.</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead><tr className="text-muted"><th className={TH}>Tier</th><th className={TH}>Human</th><th className={TH}>AI Agents</th><th className={TH}>Human role</th><th className={TH}>AI role</th></tr></thead>
                <tbody>{tiers.map((t) => (
                  <tr key={t.key} className={tierKey === t.key ? "bg-brand-mint/30" : undefined}>
                    <td className={TD}>{t.tier}</td>
                    <td className={TD}>{t.human_ratio}</td>
                    <td className={TD}>{t.ai_ratio}</td>
                    <td className={TD}>{t.human_role}</td>
                    <td className={TD}>{t.ai_role}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Section>
        )}

        <Section title={<>Optimization suggestions <span className="text-[11px] font-bold text-brand-sage bg-brand-aurora px-1.5 rounded ml-1.5">AI</span></>} defaultOpen={false}
          actions={!readOnly ? <button className="btn text-[13px]" onClick={loadSuggestions} disabled={busy !== null}>{busy === "suggest" ? "Thinking…" : "Suggest"}</button> : undefined}>
          {!team && !deferrals ? (
            <p className="text-muted text-[13px] m-0">Suggests team models that trade cost for speed and features to defer to a later release. Learns from past estimates.</p>
          ) : (
            <div>
              <h3 className="text-[13px] font-semibold mb-1">Team models</h3>
              {(team ?? []).map((t, i) => (<div key={i} className="text-[13px] py-2 border-b border-line last:border-0"><span className={"badge mr-1.5 " + (t.goal === "cheaper" ? "bg-brand-mint text-brand-sage" : "bg-brand-orange/15 text-brand-orange")}>{t.goal}</span><b>{t.scenario.name}</b>{t.result && !oralsMode && <span className="text-muted"> — {money(t.result.cost.p50)}, {t.result.duration_sprints.p50.toFixed(1)} spr</span>}<div className="text-muted">{t.rationale}</div></div>))}
              <h3 className="text-[13px] font-semibold mb-1 mt-3">Defer to a later version</h3>
              {(deferrals ?? []).map((d, i) => (<div key={i} className="text-[13px] py-2 border-b border-line last:border-0"><b>{d.feature}</b> <span className="text-brand-green font-semibold">−{d.est_sprint_saving.toFixed(1)} spr</span><div className="text-muted">{d.rationale}</div></div>))}
            </div>
          )}
        </Section>

        <Section title="Assumptions & rationale" defaultOpen={false}>
          <ul className="m-0 pl-4 text-[13px] space-y-1">{g.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </Section>
      </div>

      {!isPublic && (
        <Section title="Comments" expandable={false}>
          <CommentsSection estimateId={est.estimate_id} canComment={canComment} />
        </Section>
      )}
    </div>
  );
}
