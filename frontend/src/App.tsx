import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";
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

type View = "new" | "list" | "view" | "rates" | "admin" | "opps" | "opp";

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const SHARED_MATCH = location.pathname.match(/^\/shared\/([A-Za-z0-9]+)/);

function NavButton({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={"px-3 py-2 rounded-lg border bg-transparent transition-colors " +
        (active ? "text-white border-brand-orange" : "text-stone-300 border-transparent hover:text-white")}>
      {children}
    </button>
  );
}

export default function App() {
  const { user, loading, login, logout } = useAuth();
  const [view, setView] = useState<View>("list");
  const [current, setCurrent] = useState<EstimateResponse | null>(null);
  const [access, setAccess] = useState<{ can_edit: boolean; can_comment: boolean }>({ can_edit: true, can_comment: true });
  const [oppId, setOppId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [listKey, setListKey] = useState(0);
  const demoTried = useRef(false);

  // Demo mode: auto-login as admin and seed sample data (users, accounts,
  // opportunities, estimates, shares, comments, scenarios).
  useEffect(() => {
    if (!DEMO_MODE || demoTried.current || loading || user) return;
    demoTried.current = true;
    login("admin@architect.iq", "admin123")
      .then(() => api.seedDemo())
      .then(() => setListKey((k) => k + 1))
      .catch(() => {});
  }, [loading, user]);

  // Public, no-login share route takes precedence (checked after hooks run).
  if (SHARED_MATCH) return <SharedPage token={SHARED_MATCH[1]} />;

  async function open(id: string) {
    const [est, acc] = await Promise.all([api.getEstimate(id), api.access(id).catch(() => ({ can_edit: false, can_comment: false }))]);
    setCurrent(est);
    setAccess({ can_edit: acc.can_edit, can_comment: acc.can_comment });
    setView("view");
  }

  if (loading) return <div className="p-10 text-muted">Loading…</div>;
  if (!user) return <Login />;

  const isAdmin = user.role === "admin";
  const isClient = user.role === "client";

  return (
    <>
      <header className="flex items-center gap-4 px-7 py-3.5 bg-brand-dark text-white">
        <div className="flex items-center gap-3.5">
          <img src="/brand/Sparq-Logo-White.svg" alt="Sparq" className="h-6 w-auto block" />
          <div className="w-px h-5 bg-stone-600" />
          <div className="font-semibold text-base tracking-tight text-canvas">Architect<span className="text-brand-orange">.IQ</span></div>
        </div>
        <nav className="flex gap-1.5 ml-auto items-center">
          {!isClient && <NavButton active={view === "new"} onClick={() => setView("new")}>New estimate</NavButton>}
          <NavButton active={view === "list"} onClick={() => setView("list")}>Estimates</NavButton>
          <NavButton active={view === "opps" || view === "opp"} onClick={() => setView("opps")}>Opportunities</NavButton>
          {!isClient && <NavButton active={view === "rates"} onClick={() => setView("rates")}>Rates</NavButton>}
          {isAdmin && <NavButton active={view === "admin"} onClick={() => setView("admin")}>Admin</NavButton>}
          {current && <NavButton active={view === "view"} onClick={() => setView("view")}>Current</NavButton>}
          <span className="ml-2 text-[12px] text-stone-300">{user.name} · <span className="text-brand-aurora">{user.role}</span></span>
          <button className="px-2.5 py-1 rounded-md text-xs border border-stone-600 text-stone-300 hover:text-white ml-1" onClick={logout}>Sign out</button>
        </nav>
      </header>

      <main className="max-w-[1180px] mx-auto px-7 pt-6 pb-16">
        {seeding && <div className="text-muted text-sm mb-3">Loading demo data…</div>}
        {view === "new" && !isClient && <NewEstimate onOpen={open} />}
        {view === "list" && <EstimatesList key={listKey} onOpen={open} />}
        {view === "opps" && <OpportunitiesList onOpen={(id) => { setOppId(id); setView("opp"); }} />}
        {view === "opp" && oppId && <OpportunityView id={oppId} onOpenEstimate={open} />}
        {view === "rates" && !isClient && <RatesView />}
        {view === "admin" && isAdmin && <AdminView />}
        {view === "view" && current && <EstimateView key={current.estimate_id + current.version} initial={current} canEdit={access.can_edit} canComment={access.can_comment} canClone={!isClient} onClone={open} />}
        {view === "view" && !current && <div className="text-muted">No estimate selected.</div>}
      </main>
    </>
  );
}
