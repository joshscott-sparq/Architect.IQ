import { useEffect, useState } from "react";
import { api } from "../api";
import type { EstimateSummary } from "../types";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const DEMO_PREFIX = "[Demo]";

export function EstimatesList({
  onOpen,
  seeding,
  demoMode,
}: {
  onOpen: (id: string) => void;
  seeding?: boolean;
  demoMode?: boolean;
}) {
  const [items, setItems] = useState<EstimateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listEstimates().then(setItems).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-brand-orange-deep text-[13px]">{error}</div>;
  if (!items) return <div className="text-muted text-sm">Loading…</div>;

  const visible = demoMode ? items : items.filter((it) => !it.project_name.startsWith(DEMO_PREFIX));

  if (visible.length === 0)
    return (
      <div className="card text-center py-10">
        <h3 className="font-semibold mb-1">{seeding ? "Loading demo data…" : "No estimates yet"}</h3>
        <p className="text-muted">
          {seeding ? "Sample estimates are being prepared." : "Create one from the New estimate tab."}
        </p>
      </div>
    );

  return (
    <div>
      {visible.map((it) => (
        <div
          key={it.estimate_id}
          onClick={() => onOpen(it.estimate_id)}
          className="flex items-center gap-3 px-3.5 py-3 border border-line rounded-xl mb-2 bg-white cursor-pointer hover:border-brand-orange"
        >
          <div className="flex-1">
            <b>{it.project_name}</b>
            <div className="text-muted text-xs">
              {(it.pattern_ids[0] ?? "no pattern")} · v{it.version}
            </div>
          </div>
          <div className="text-right">
            <div>{it.cost_p50 != null ? money(it.cost_p50) : "—"}</div>
            <div className="text-muted text-xs">{it.effort_p50 != null ? `${Math.round(it.effort_p50)} pts` : ""}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
