import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import { useTheme } from "./theme";
import type { EstimateResponse } from "./types";
import { NewEstimate } from "./components/NewEstimate";
import { EstimateView } from "./components/EstimateView";
import { EstimatesList } from "./components/EstimatesList";
import { RatesView } from "./components/RatesView";
import { AdminView } from "./components/AdminView";
import { OpportunityView } from "./components/OpportunityView";
import { OpportunitiesList } from "./components/OpportunitiesList";
import { Login } from "./components/Login";
import { SharedPage } from "./components/SharedPage";
import { Avatar } from "./components/Avatar";
import { ContextPanel } from "./components/ContextPanel";
import type { ContextPanel as Panel } from "./types";

const EMPTY_PANEL: Panel = { requirements: [], risks: [], accelerators: [], assumptions: [], phases: [], external_sources: [] };

type View = "new" | "list" | "view" | "rates" | "admin" | "opps" | "opp";

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const SHARED_MATCH = location.pathname.match(/^\/shared\/([A-Za-z0-9]+)/);

export default function App() {
  const { user, loading, login, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [view, setView] = useState<View>("list");
  const [current, setCurrent] = useState<EstimateResponse | null>(null);
  const [access, setAccess] = useState<{ can_edit: boolean; can_comment: boolean }>({ can_edit: true, can_comment: true });
  const [oppId, setOppId] = useState<string | null>(null);
  const [listKey, setListKey] = useState(0);
  const [menu, setMenu] = useState<null | "nav" | "user">(null);
  const [nonce, setNonce] = useState(0);
  const [ctxCollapsed, setCtxCollapsed] = useState(() => localStorage.getItem("aiq_ctx_collapsed") === "1");
  const [demoError, setDemoError] = useState<string | null>(null);
  const demoTried = useRef(false);

  function toggleCtx() {
    setCtxCollapsed((c) => { localStorage.setItem("aiq_ctx_collapsed", c ? "0" : "1"); return !c; });
  }

  useEffect(() => {
    if (!DEMO_MODE || demoTried.current || loading || user) return;
    demoTried.current = true;
    login("admin@architect.iq", "admin123")
      .then(() => api.seedDemo())
      .then(() => setListKey((k) => k + 1))
      .catch(() => setDemoError("Couldn't reach the backend on :8000. Start it first (see README Quick start), then reload."));
  }, [loading, user]);

  if (SHARED_MATCH) return <SharedPage token={SHARED_MATCH[1]} />;
  if (loading) return <div className="p-10 text-muted">Loading…</div>;
  if (!user) return <Login demoError={demoError} />;

  const isAdmin = user.role === "admin";
  const isClient = user.role === "client";

  async function open(id: string) {
    const [est, acc] = await Promise.all([api.getEstimate(id), api.access(id).catch(() => ({ can_edit: false, can_comment: false }))]);
    setCurrent(est);
    setAccess({ can_edit: acc.can_edit, can_comment: acc.can_comment });
    setView("view");
  }

  const nav: { key: View; label: string; show: boolean }[] = [
    { key: "new", label: "New estimate", show: !isClient },
    { key: "list", label: "Estimates", show: true },
    { key: "opps", label: "Opportunities", show: true },
    { key: "rates", label: "Rates", show: !isClient },
    { key: "admin", label: "Admin", show: isAdmin },
  ];
  const go = (v: View) => { setView(v); setMenu(null); };

  return (
    <>
      <header className="flex items-center gap-4 px-5 sm:px-7 py-3 bg-brand-dark text-white relative">
        <div className="flex items-center gap-3.5">
          <img src="/brand/Sparq-Logo-White.svg" alt="Sparq" className="h-6 w-auto block" />
          <div className="w-px h-5 bg-stone-600" />
          <button className="font-semibold text-base tracking-tight text-white" onClick={() => go("list")}>
            Architect<span className="text-brand-orange">.IQ</span>
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {DEMO_MODE && <span className="hidden sm:inline px-2.5 py-1 rounded-md text-xs font-semibold text-brand-deepest bg-brand-aurora">Demo</span>}

          {/* Hamburger nav */}
          <div className="relative">
            <button aria-label="Menu" className="px-2.5 py-2 rounded-lg text-stone-300 hover:text-white border border-transparent hover:border-stone-600" onClick={() => setMenu(menu === "nav" ? null : "nav")}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
            {menu === "nav" && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
                <div className="absolute right-0 mt-1 z-20 bg-surface text-ink border border-line rounded-xl py-1 shadow-xl min-w-[180px]">
                  {nav.filter((n) => n.show).map((n) => (
                    <button key={n.key} className={"block w-full text-left px-4 py-2 text-[14px] hover:bg-canvas " + (view === n.key ? "text-brand-orange font-semibold" : "")} onClick={() => go(n.key)}>{n.label}</button>
                  ))}
                  {current && <button className="block w-full text-left px-4 py-2 text-[14px] hover:bg-canvas" onClick={() => go("view")}>Current estimate</button>}
                </div>
              </>
            )}
          </div>

          {/* Avatar dropdown */}
          <div className="relative">
            <button onClick={() => setMenu(menu === "user" ? null : "user")} className="rounded-full ring-2 ring-transparent hover:ring-stone-600">
              <Avatar name={user.name} size={32} />
            </button>
            {menu === "user" && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
                <div className="absolute right-0 mt-1 z-20 bg-surface text-ink border border-line rounded-xl py-1 shadow-xl min-w-[240px]">
                  <div className="px-4 py-2 border-b border-line">
                    <div className="text-[12px] text-muted">Signed in as · {user.role}</div>
                    <div className="text-[13px] font-medium truncate">{user.email}</div>
                  </div>
                  <button className="flex items-center gap-2 w-full text-left px-4 py-2 text-[14px] hover:bg-canvas" onClick={() => { toggle(); setMenu(null); }}>
                    {theme === "dark" ? "☀︎ Light mode" : "☾ Dark mode"}
                  </button>
                  <button className="flex items-center gap-2 w-full text-left px-4 py-2 text-[14px] hover:bg-canvas" onClick={logout}>⇥ Sign out</button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className={"max-w-[1180px] mx-auto px-5 sm:px-7 pt-6 " + (view === "view" && current ? (ctxCollapsed ? "pb-24" : "pb-[46vh]") : "pb-16")}>
        {view === "new" && !isClient && <NewEstimate onOpen={open} />}
        {view === "list" && <EstimatesList key={listKey} onOpen={open} />}
        {view === "opps" && <OpportunitiesList onOpen={(id) => { setOppId(id); setView("opp"); }} />}
        {view === "opp" && oppId && <OpportunityView id={oppId} onOpenEstimate={open} />}
        {view === "rates" && !isClient && <RatesView />}
        {view === "admin" && isAdmin && <AdminView />}
        {view === "view" && current && <EstimateView key={current.estimate_id + "-" + current.version + "-" + nonce} initial={current} canEdit={access.can_edit} canComment={access.can_comment} canClone={!isClient} onClone={open} />}
        {view === "view" && !current && <div className="text-muted">No estimate selected.</div>}
      </main>

      {/* Context Panel docked at the bottom of the estimate (Output Zone above). */}
      {view === "view" && current && (
        <ContextPanel
          key={current.estimate_id}
          estimateId={current.estimate_id}
          initial={current.graph.context_panel ?? EMPTY_PANEL}
          canEdit={access.can_edit}
          collapsed={ctxCollapsed}
          onToggle={toggleCtx}
          onRecalc={(e) => { setCurrent(e); setNonce((n) => n + 1); }}
        />
      )}
    </>
  );
}
