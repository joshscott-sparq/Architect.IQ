import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { ContextEntry, ContextPanel as Panel, EstimateResponse, ExternalSource, LinkedFactor, Reference } from "../types";

let _seq = 0;
const uid = () => `e${Date.now().toString(36)}${_seq++}`;

const ENTRY_TABS = [
  { key: "requirements", label: "Requirements", scoped: false, hint: "What's being built — a PRD, feature list, or notes." },
  { key: "phases", label: "Phases", scoped: false, hint: "Stages of the effort (Discovery, MVP, V1)." },
  { key: "risks", label: "Risks", scoped: true, hint: "Facts that could slow the effort down — plus the complexity factors they (and other context) derive." },
  { key: "accelerators", label: "Accelerators", scoped: true, hint: "Facts that speed the effort up." },
  { key: "assumptions", label: "Assumptions", scoped: true, hint: "Things the estimate assumes to be true." },
  { key: "reference", label: "Reference Estimates", scoped: false, hint: "Similar past estimates surfaced from memory." },
  { key: "external", label: "External Sources", scoped: false, hint: "Live systems feeding context." },
] as const;

type TabKey = (typeof ENTRY_TABS)[number]["key"];
const LIST_TABS: TabKey[] = ["requirements", "risks", "accelerators", "assumptions"];

const SOURCE_TYPES = ["sparqos", "speckit", "github", "salesforce", "notion", "slack", "other"] as const;

function withSparqOS(panel: Panel): Panel {
  if (panel.external_sources.some((s) => s.type === "sparqos")) return panel;
  const sparqos: ExternalSource = {
    id: "sparqos-default", type: "sparqos", display_name: "SparqOS", status: "connected",
    access_mode: "read-only", config: {},
  };
  return { ...panel, external_sources: [sparqos, ...panel.external_sources] };
}

export function ContextPanel({ estimateId, initial, references, complexityFactors, canEdit, onRecalc, collapsed, onToggle }: {
  estimateId: string;
  initial: Panel;
  references: Reference[];
  complexityFactors: LinkedFactor[];
  canEdit: boolean;
  onRecalc: (e: EstimateResponse) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [panel, setPanel] = useState<Panel>(() => withSparqOS(initial));
  const [tab, setTab] = useState<TabKey>("requirements");
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRun = useRef(true);

  // Debounced auto-recalculate on any context change.
  useEffect(() => {
    if (!canEdit) return;
    if (firstRun.current) { firstRun.current = false; return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true);
      try { onRecalc(await api.saveContext(estimateId, panel)); } finally { setSaving(false); }
    }, 1000);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

  const toggleCollapsed = onToggle;

  function count(key: TabKey): number {
    if (key === "external") return panel.external_sources.length;
    if (key === "phases") return panel.phases.length;
    if (key === "reference") return references.length;
    return (panel[key] as ContextEntry[]).length;
  }

  function addEntry(key: Exclude<TabKey, "phases" | "external" | "reference">, e: Partial<ContextEntry>) {
    const entry: ContextEntry = { id: uid(), tab: key, source_type: "manual", content: "", scope: "estimate", status: "ingested", ...e };
    setPanel((p) => ({ ...p, [key]: [...(p[key] as ContextEntry[]), entry] }));
  }
  function removeEntry(key: Exclude<TabKey, "phases" | "external" | "reference">, id: string) {
    setPanel((p) => ({ ...p, [key]: (p[key] as ContextEntry[]).filter((x) => x.id !== id) }));
  }
  function setScope(key: Exclude<TabKey, "phases" | "external" | "reference">, id: string, scope: string) {
    setPanel((p) => ({ ...p, [key]: (p[key] as ContextEntry[]).map((x) => x.id === id ? { ...x, scope } : x) }));
  }
  function editContent(key: Exclude<TabKey, "phases" | "external" | "reference">, id: string, content: string) {
    setPanel((p) => ({ ...p, [key]: (p[key] as ContextEntry[]).map((x) => x.id === id ? { ...x, content } : x) }));
  }

  const dockHeight = collapsed ? "auto" : "42vh";

  return (
    <div className="fixed left-0 right-0 bottom-0 z-30 bg-surface border-t border-line shadow-[0_-8px_24px_rgba(0,0,0,0.08)]" style={{ height: dockHeight }}>
      <div className="max-w-[1180px] mx-auto">
        {/* Tab bar (horizontally scrollable) + collapse handle */}
        <div className="flex items-stretch border-b border-line px-5 sm:px-7">
          <div className="flex items-center gap-1.5 pr-3 mr-2 border-r border-line shrink-0">
            <span className="text-[13px] font-semibold text-ink">Context</span>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
            {ENTRY_TABS.map((t) => (
              <button key={t.key}
                onClick={() => { setTab(t.key); if (collapsed) toggleCollapsed(); }}
                className={"shrink-0 whitespace-nowrap px-3 py-2.5 text-[13px] font-medium border-b-2 -mb-px " + (tab === t.key && !collapsed ? "border-brand-orange text-ink" : "border-transparent text-muted hover:text-ink")}>
                {t.label}
                {count(t.key) > 0 && <span className="ml-1.5 text-[11px] bg-brand-mint text-brand-sage rounded-full px-1.5">{count(t.key)}</span>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pl-2 shrink-0 border-l border-line">
            {saving && <span className="text-[12px] text-muted hidden sm:inline">Recalculating…</span>}
            <button onClick={toggleCollapsed} className="text-muted hover:text-ink px-2 py-1" title={collapsed ? "Expand" : "Collapse"}>
              {collapsed ? "▲" : "▼"}
            </button>
          </div>
        </div>

        {!collapsed && (
          <div className="overflow-y-auto px-5 sm:px-7 py-3" style={{ height: "calc(42vh - 44px)" }}>
            {LIST_TABS.includes(tab) && (
              <EntryTab
                tabKey={tab as Exclude<TabKey, "phases" | "external" | "reference">}
                entries={panel[tab as "requirements"] as ContextEntry[]}
                scoped={ENTRY_TABS.find((t) => t.key === tab)!.scoped}
                hint={ENTRY_TABS.find((t) => t.key === tab)!.hint}
                phases={panel.phases}
                canEdit={canEdit}
                onAdd={addEntry} onRemove={removeEntry} onScope={setScope} onEdit={editContent}
                complexityFactors={tab === "risks" ? complexityFactors : undefined}
              />
            )}
            {tab === "phases" && <PhasesTab panel={panel} setPanel={setPanel} canEdit={canEdit} />}
            {tab === "reference" && <ReferenceTab references={references} />}
            {tab === "external" && <ExternalTab panel={panel} setPanel={setPanel} canEdit={canEdit} />}
          </div>
        )}
      </div>
    </div>
  );
}

const SINGULAR: Record<string, string> = {
  requirements: "a requirement", risks: "a risk", accelerators: "an accelerator", assumptions: "an assumption",
};

function EntryTab({ tabKey, entries, scoped, hint, phases, canEdit, onAdd, onRemove, onScope, onEdit, complexityFactors }: any) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [urlMode, setUrlMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function submitText() {
    if (!text.trim()) return;
    onAdd(tabKey, { content: text.trim() });
    setText("");
  }

  // On the Requirements tab, dropped/fetched content gets decomposed into
  // atomic requirements and compared against what's already listed, so a
  // dropped doc adds several distinct new entries instead of one raw blob
  // that restates things already captured. Other tabs keep the raw content
  // as a single entry, as before.
  async function addExtractedContent(sourceType: "file" | "url", reference: string, rawText: string) {
    if (tabKey !== "requirements" || !rawText.trim()) {
      onAdd(tabKey, { source_type: sourceType, reference, content: rawText });
      return;
    }
    const existing = (entries as ContextEntry[]).map((e) => e.content).filter(Boolean);
    try {
      const decomposed = await api.decomposeRequirements(rawText, existing);
      if (decomposed.length === 0) {
        onAdd(tabKey, { source_type: sourceType, reference, content: "No new requirements found — already covered by existing entries." });
        return;
      }
      for (const d of decomposed) onAdd(tabKey, { source_type: sourceType, reference, content: d.text });
    } catch {
      // Decomposition failed — keep the raw content rather than losing it.
      onAdd(tabKey, { source_type: sourceType, reference, content: rawText });
    }
  }

  async function addFromUrl() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const { text: fetched } = await api.ingestUrl(url.trim());
      await addExtractedContent("url", url.trim(), fetched);
      setUrl(""); setUrlMode(false);
    } catch { onAdd(tabKey, { source_type: "url", reference: url.trim(), content: "", status: "error" }); }
    finally { setBusy(false); }
  }
  async function addFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      const tempId = "tmp" + Math.random();
      onAdd(tabKey, { id: tempId, source_type: "file", reference: f.name, content: "", status: "processing" });
      try {
        const { filename, text: extracted } = await api.extractContext(f);
        // Keep the "processing" placeholder visible through decomposition too,
        // then swap it for the real entry(ies) once that's done.
        await addExtractedContent("file", filename, extracted);
        onRemove(tabKey, tempId);
      } catch {
        onRemove(tabKey, tempId);
        onAdd(tabKey, { source_type: "file", reference: f.name, content: "", status: "error" });
      }
    }
  }

  return (
    <div>
      {canEdit && (
        <div
          className={"relative rounded-2xl border bg-field transition-colors " + (drag ? "border-brand-orange" : "border-line focus-within:border-brand-orange/60")}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDrag(false); }}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        >
          <textarea
            className="w-full bg-transparent resize-none px-4 pt-3.5 pb-1 outline-none text-[15px] min-h-[86px] text-ink placeholder:text-muted"
            placeholder={`Add ${SINGULAR[tabKey] ?? "context"} — type or paste, drop a file anywhere here, or add a URL`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitText(); } }}
          />
          {urlMode && (
            <div className="flex gap-1.5 px-3 pb-2">
              <input className="field text-[13px]" placeholder="https://…" value={url} autoFocus
                onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFromUrl()} />
              <button className="btn text-[12px]" onClick={addFromUrl} disabled={busy || !url.trim()}>{busy ? "Fetching…" : "Fetch"}</button>
              <button className="text-muted px-2" onClick={() => { setUrlMode(false); setUrl(""); }}>×</button>
            </div>
          )}
          <div className="flex items-center gap-2 px-2.5 pb-2.5">
            <div className="relative">
              <button className="w-8 h-8 rounded-full border border-line text-muted hover:text-ink hover:border-brand-orange flex items-center justify-center text-lg leading-none"
                onClick={() => setMenuOpen((m) => !m)} title="Add">+</button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute left-0 bottom-10 z-20 bg-surface border border-line rounded-xl py-1 shadow-xl min-w-[160px] text-[13px]">
                    <button className="block w-full text-left px-3 py-2 hover:bg-canvas" onClick={() => { setMenuOpen(false); fileRef.current?.click(); }}>📎 Upload file</button>
                    <button className="block w-full text-left px-3 py-2 hover:bg-canvas" onClick={() => { setMenuOpen(false); setUrlMode(true); }}>🔗 Add a URL</button>
                  </div>
                </>
              )}
            </div>
            <span className="ml-auto text-[12px] text-muted hidden sm:inline">Enter to add · Shift+Enter for a new line</span>
            <button
              className={"w-8 h-8 rounded-full flex items-center justify-center transition-colors " + (text.trim() ? "bg-brand-orange text-white" : "bg-line text-muted cursor-not-allowed")}
              onClick={submitText} disabled={!text.trim()} title="Add">↑</button>
          </div>
          <input ref={fileRef} type="file" className="hidden" multiple onChange={(e) => addFiles(e.target.files)} />
          {drag && (
            <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-brand-orange bg-brand-orange/10 flex items-center justify-center text-brand-orange font-medium pointer-events-none">
              Drop file to add as context
            </div>
          )}
        </div>
      )}
      <p className="text-muted text-[12px] mt-2 mb-3">{hint}</p>

      {complexityFactors && complexityFactors.filter((f: LinkedFactor) => !f.family.startsWith("Risk: ")).length > 0 && (
        <div className="mb-3 border border-line rounded-xl overflow-hidden">
          <div className="bg-canvas px-2.5 py-1.5 text-[11px] uppercase text-muted font-semibold">Complexity factors — derived from context, not editable here</div>
          {complexityFactors.filter((f: LinkedFactor) => !f.family.startsWith("Risk: ")).map((f: LinkedFactor, i: number) => (
            <div key={i} className="flex items-center gap-2 text-[13px] py-1.5 px-2.5 border-t border-line">
              <span className="flex-1">{f.family}</span>
              <span className="badge bg-brand-mint text-brand-sage">{f.severity}</span>
              <span className="text-brand-orange-deep font-semibold w-12 text-right">{f.impact.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-muted text-[13px]">Nothing here yet.</p>
      ) : (
        <div className="overflow-x-auto border border-line rounded-xl">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-muted bg-canvas">
                <th className="text-left py-1.5 px-2.5 border-b border-line uppercase text-[11px] w-16">Source</th>
                <th className="text-left py-1.5 px-2.5 border-b border-line uppercase text-[11px]">Content</th>
                {scoped && <th className="text-left py-1.5 px-2.5 border-b border-line uppercase text-[11px] w-40">Scope</th>}
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e: ContextEntry) => (
                <tr key={e.id} className="border-b border-line last:border-0 align-top">
                  <td className="py-1.5 px-2.5">
                    <span className={"badge " + (e.status === "error" ? "bg-orange-100 text-brand-orange-deep" : e.status === "processing" ? "bg-line text-muted" : "bg-brand-mint text-brand-sage")}>
                      {e.status === "processing" ? "…" : e.source_type}
                    </span>
                    {e.reference && <div className="text-muted text-[11px] truncate mt-1" title={e.reference}>{e.reference}</div>}
                  </td>
                  <td className="py-1 px-1">
                    <textarea
                      className="w-full bg-transparent resize-none outline-none text-[13px] px-1.5 py-1 rounded hover:bg-canvas focus:bg-canvas min-h-[36px]"
                      value={e.content}
                      placeholder={e.status === "processing" ? "reading…" : "no content"}
                      onChange={(ev) => onEdit(tabKey, e.id, ev.target.value)}
                      disabled={!canEdit || e.status === "processing"}
                      rows={Math.max(1, Math.ceil(e.content.length / 70))}
                    />
                  </td>
                  {scoped && (
                    <td className="py-1.5 px-2.5">
                      <select className="field !w-full !py-1 text-[12px]" value={e.scope} onChange={(ev) => onScope(tabKey, e.id, ev.target.value)} disabled={!canEdit}>
                        <option value="estimate">Entire estimate</option>
                        {phases.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                  )}
                  <td className="py-1.5 px-1.5 text-center">
                    {canEdit && <button className="text-muted hover:text-brand-orange-deep" title="Remove" onClick={() => onRemove(tabKey, e.id)}>×</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PhasesTab({ panel, setPanel, canEdit }: any) {
  const [name, setName] = useState("");
  function add() {
    if (!name.trim()) return;
    setPanel((p: Panel) => ({ ...p, phases: [...p.phases, { id: uid(), name: name.trim(), method: "relative" }] }));
    setName("");
  }
  function update(id: string, patch: any) {
    setPanel((p: Panel) => ({ ...p, phases: p.phases.map((ph) => ph.id === id ? { ...ph, ...patch } : ph) }));
  }
  function remove(id: string) { setPanel((p: Panel) => ({ ...p, phases: p.phases.filter((ph) => ph.id !== id) })); }

  return (
    <div>
      <p className="text-muted text-[12px] mt-0 mb-2">Stages of the effort. Define by dates, a duration, or leave relative.</p>
      {panel.phases.length > 0 && (
        <div className="overflow-x-auto border border-line rounded-xl mb-3">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-muted bg-canvas">
                <th className="text-left py-1.5 px-2.5 border-b border-line uppercase text-[11px]">Name</th>
                <th className="text-left py-1.5 px-2.5 border-b border-line uppercase text-[11px] w-28">Method</th>
                <th className="text-left py-1.5 px-2.5 border-b border-line uppercase text-[11px]">When</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {panel.phases.map((ph: any) => (
                <tr key={ph.id} className="border-b border-line last:border-0">
                  <td className="py-1 px-1.5"><input className="field !w-full !py-1" value={ph.name} onChange={(e) => update(ph.id, { name: e.target.value })} disabled={!canEdit} /></td>
                  <td className="py-1 px-1.5">
                    <select className="field !w-full !py-1 text-[12px]" value={ph.method} onChange={(e) => update(ph.id, { method: e.target.value })} disabled={!canEdit}>
                      <option value="relative">Relative</option>
                      <option value="duration">Duration</option>
                      <option value="dates">Dates</option>
                    </select>
                  </td>
                  <td className="py-1 px-1.5">
                    {ph.method === "duration" && <input className="field !w-28 !py-1 text-[12px]" type="number" placeholder="weeks" value={ph.duration_weeks ?? ""} onChange={(e) => update(ph.id, { duration_weeks: parseFloat(e.target.value) || null })} disabled={!canEdit} />}
                    {ph.method === "dates" && <div className="flex gap-1.5">
                      <input className="field !w-36 !py-1 text-[12px]" type="date" value={ph.start_date ?? ""} onChange={(e) => update(ph.id, { start_date: e.target.value })} disabled={!canEdit} />
                      <input className="field !w-36 !py-1 text-[12px]" type="date" value={ph.end_date ?? ""} onChange={(e) => update(ph.id, { end_date: e.target.value })} disabled={!canEdit} />
                    </div>}
                    {ph.method === "relative" && <span className="text-muted text-[12px]">—</span>}
                  </td>
                  <td className="py-1 px-1.5 text-center">
                    {canEdit && <button className="text-muted hover:text-brand-orange-deep" title="Remove" onClick={() => remove(ph.id)}>×</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && (
        <div className="flex gap-1.5 mt-3">
          <input className="field !w-56" placeholder="Phase name (e.g. Discovery)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button className="btn text-[12px]" onClick={add} disabled={!name.trim()}>Add phase</button>
        </div>
      )}
    </div>
  );
}

function ReferenceTab({ references }: { references: Reference[] }) {
  return (
    <div>
      <p className="text-muted text-[12px] mt-0 mb-2">Similar past estimates, surfaced from memory to ground this one.</p>
      {references.length === 0 && <p className="text-muted text-[13px]">No reference-class estimates yet.</p>}
      {references.map((r) => (
        <div key={r.estimate_id} className="py-2 border-b border-line last:border-0 text-[13px]">
          <b>{r.project_name}</b> <span className="text-brand-green font-semibold">{Math.round(r.similarity * 100)}%</span>
          <div className="text-muted">{r.why}</div>
        </div>
      ))}
    </div>
  );
}

function ExternalTab({ panel, setPanel, canEdit }: any) {
  const [type, setType] = useState<string>("salesforce");
  const [nameV, setNameV] = useState("");
  function add() {
    const src: ExternalSource = {
      id: uid(), type: type as any, display_name: nameV.trim() || type,
      status: "needs_authentication", access_mode: type === "speckit" ? "read-write" : "read-only", config: {},
    };
    setPanel((p: Panel) => ({ ...p, external_sources: [...p.external_sources, src] }));
    setNameV("");
  }
  function remove(id: string) { setPanel((p: Panel) => ({ ...p, external_sources: p.external_sources.filter((s) => s.id !== id) })); }

  const statusColor = (s: string) => s === "connected" ? "bg-brand-aurora text-brand-deepest" : s === "error" ? "bg-orange-100 text-brand-orange-deep" : "bg-brand-mint text-brand-sage";

  return (
    <div>
      <p className="text-muted text-[12px] mt-0 mb-2">Live systems feeding context. SparqOS is always on (read-only). Others connect per estimate.</p>
      {panel.external_sources.map((s: any) => (
        <div key={s.id} className="flex items-center gap-2 py-2 border-b border-line last:border-0 text-[13px]">
          <span className="badge bg-brand-mint text-brand-sage uppercase">{s.type}</span>
          <span className="flex-1">{s.display_name}</span>
          <span className="badge bg-line text-muted">{s.access_mode}</span>
          <span className={"badge " + statusColor(s.status)}>{s.status.replace("_", " ")}</span>
          {canEdit && s.type !== "sparqos" && <button className="text-muted hover:text-brand-orange-deep text-[12px]" onClick={() => remove(s.id)}>remove</button>}
        </div>
      ))}
      {canEdit && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          <select className="field !w-auto" value={type} onChange={(e) => setType(e.target.value)}>
            {SOURCE_TYPES.filter((t) => t !== "sparqos").map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input className="field !w-56" placeholder="Display name" value={nameV} onChange={(e) => setNameV(e.target.value)} />
          <button className="btn text-[12px]" onClick={add}>Connect source</button>
        </div>
      )}
    </div>
  );
}
