import { useEffect, useState } from "react";
import { api } from "../api";

const money = (n?: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export function OpportunityView({ id, onOpenEstimate }: { id: string; onOpenEstimate: (estimateId: string) => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getOpportunity>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getOpportunity(id).then(setData).catch((e) => setError(String(e)));
  }, [id]);

  if (error) return <div className="text-brand-orange-deep text-[13px]">{error}</div>;
  if (!data) return <div className="text-muted text-sm">Loading…</div>;

  const { opportunity, account, estimates, notion_notes } = data;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h1 className="m-0 text-[22px] font-bold">{opportunity.name}</h1>
        {account && <span className="badge bg-brand-mint text-brand-sage">{account.name}</span>}
        {opportunity.sf_opportunity_id && <span className="badge bg-orange-100 text-brand-orange">SF {opportunity.sf_opportunity_id}</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="card">
          <h2 className="card-h">Estimates</h2>
          {estimates.length === 0 && <p className="text-muted text-[13px] m-0">No estimates on this opportunity yet.</p>}
          {estimates.map((e) => (
            <div key={e.estimate_id} onClick={() => onOpenEstimate(e.estimate_id)}
              className="flex items-center gap-2 py-2 border-b border-line last:border-0 cursor-pointer hover:text-brand-orange text-[13px]">
              <div className="flex-1">
                <b>{e.project_name}</b>
                {opportunity.active_estimate_id === e.estimate_id && <span className="badge bg-brand-aurora text-brand-deepest ml-1.5">official</span>}
                <div className="text-muted text-[11px]">{(e.pattern_ids?.[0]) || "no pattern"} · v{e.version}</div>
              </div>
              <div className="text-right">{money(e.cost_p50)}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <h2 className="card-h">
            Notion notes
            {opportunity.notion_page_ref && <a className="normal-case tracking-normal text-brand-orange ml-2" href={opportunity.notion_page_ref} target="_blank" rel="noreferrer">open ↗</a>}
          </h2>
          {notion_notes.length === 0 && <p className="text-muted text-[13px] m-0">No Notion page linked.</p>}
          {notion_notes.map((n, i) => (
            <div key={i} className="py-2 border-b border-line last:border-0 text-[13px]">
              <b>{n.title}</b>
              <div className="text-muted">{n.excerpt}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
