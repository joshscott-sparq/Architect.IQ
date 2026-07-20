import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export function OpportunitiesList({ onOpen, seeding = false, canCreate = true }: {
  onOpen: (id: string) => void;
  seeding?: boolean;
  canCreate?: boolean;
}) {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [opps, setOpps] = useState<{ id: string; name: string; account_id: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listAccounts(), api.listOpportunities()])
      .then(([a, o]) => { setAccounts(a); setOpps(o); })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-brand-orange-deep text-[13px]">{error}</div>;

  const byAccount = accounts
    .map((a) => ({ account: a, opps: opps.filter((o) => o.account_id === a.id) }))
    .filter((g) => g.opps.length > 0);

  return (
    <div>
      {canCreate && (
        <div className="flex justify-end mb-4">
          <button className="btn btn-primary text-[13px]" onClick={() => navigate("/new")}>+ New estimate</button>
        </div>
      )}
      {byAccount.length === 0 ? (
        <div className="card text-center py-10">
          <h3 className="font-semibold mb-1">{seeding ? "Loading demo data…" : "No opportunities yet"}</h3>
          <p className="text-muted">
            {seeding
              ? "Seeding sample accounts and opportunities — this page updates automatically."
              : "An admin can add accounts and opportunities."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {byAccount.map(({ account, opps }) => (
            <div key={account.id} className="card">
              <h2 className="card-h">{account.name}</h2>
              {opps.map((o) => (
                <div key={o.id} onClick={() => onOpen(o.id)}
                  className="py-2 border-b border-line last:border-0 cursor-pointer hover:text-brand-orange text-[13px]">
                  <b>{o.name}</b>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
