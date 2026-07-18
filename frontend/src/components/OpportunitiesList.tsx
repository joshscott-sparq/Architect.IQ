import { useEffect, useState } from "react";
import { api } from "../api";

export function OpportunitiesList({ onOpen }: { onOpen: (id: string) => void }) {
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

  if (byAccount.length === 0)
    return <div className="card text-muted">No opportunities yet. An admin can add accounts and opportunities.</div>;

  return (
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
  );
}
