import { useEffect, useState } from "react";
import { api } from "./api";
import type { EstimateResponse } from "./types";
import { NewEstimate } from "./components/NewEstimate";
import { EstimateView } from "./components/EstimateView";
import { EstimatesList } from "./components/EstimatesList";
import { RatesView } from "./components/RatesView";

type View = "new" | "list" | "view" | "rates";

// Demo experience is enabled only under `npm run demo` (vite --mode demo, which
// loads .env.demo). Off in `npm run dev` and `npm run prod`.
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

function NavButton({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        "px-3 py-2 rounded-lg border bg-transparent transition-colors " +
        (active ? "text-white border-brand-orange" : "text-stone-300 border-transparent hover:text-white")
      }
    >
      {children}
    </button>
  );
}

export default function App() {
  const [view, setView] = useState<View>(DEMO_MODE ? "list" : "new");
  const [current, setCurrent] = useState<EstimateResponse | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [listKey, setListKey] = useState(0);

  // In demo mode, auto-seed sample data on load so every feature is immediately
  // testable with dummy data. Idempotent, so it's a no-op once seeded.
  useEffect(() => {
    if (!DEMO_MODE) return;
    setSeeding(true);
    api
      .seedDemo()
      .then(() => setListKey((k) => k + 1))
      .finally(() => setSeeding(false));
  }, []);

  async function open(id: string) {
    const est = await api.getEstimate(id);
    setCurrent(est);
    setView("view");
  }

  return (
    <>
      <header className="flex items-center gap-4 px-7 py-3.5 bg-brand-dark text-white">
        <div className="flex items-center gap-3.5">
          <img src="/brand/Sparq-Logo-White.svg" alt="Sparq" className="h-6 w-auto block" />
          <div className="w-px h-5 bg-stone-600" />
          <div className="font-semibold text-base tracking-tight text-canvas">
            Architect<span className="text-brand-orange">.IQ</span>
          </div>
        </div>
        <nav className="flex gap-1.5 ml-auto items-center">
          <NavButton active={view === "new"} onClick={() => setView("new")}>New estimate</NavButton>
          <NavButton active={view === "list"} onClick={() => setView("list")}>Estimates</NavButton>
          <NavButton active={view === "rates"} onClick={() => setView("rates")}>Rates</NavButton>
          {current && <NavButton active={view === "view"} onClick={() => setView("view")}>Current</NavButton>}
          {DEMO_MODE && (
            <span className="ml-2 px-2.5 py-1 rounded-md text-xs font-semibold text-brand-deepest bg-brand-aurora">
              {seeding ? "Loading demo…" : "Demo mode"}
            </span>
          )}
        </nav>
      </header>

      <main className="max-w-[1180px] mx-auto px-7 pt-6 pb-16">
        {view === "new" && <NewEstimate onCreated={(e) => { setCurrent(e); setView("view"); }} />}
        {view === "list" && (
          <EstimatesList key={listKey} onOpen={open} demoMode={DEMO_MODE} seeding={seeding} />
        )}
        {view === "rates" && <RatesView />}
        {view === "view" && current && <EstimateView key={current.estimate_id + current.version} initial={current} />}
        {view === "view" && !current && <div className="text-muted">No estimate selected.</div>}
      </main>
    </>
  );
}
