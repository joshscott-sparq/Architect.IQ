import { useEffect, useState } from "react";
import { api, type AuthUser } from "../api";

const ROLES = ["admin", "user", "client"];

export function AdminView() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [opps, setOpps] = useState<{ id: string; name: string; account_id: string }[]>([]);
  const [nu, setNu] = useState({ email: "", name: "", role: "user", password: "" });
  const [na, setNa] = useState({ name: "", sf: "" });
  const [no, setNo] = useState({ name: "", account_id: "", notion: "" });
  const [err, setErr] = useState<string | null>(null);

  function refresh() {
    api.listUsers().then(setUsers).catch((e) => setErr(String(e)));
    api.listAccounts().then(setAccounts).catch(() => {});
    api.listOpportunities().then(setOpps).catch(() => {});
  }
  useEffect(refresh, []);

  const wrap = (fn: Promise<unknown>) => fn.then(refresh).catch((e) => setErr(String(e)));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="card">
        <h2 className="card-h">Users</h2>
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-2 py-1.5 border-b border-line last:border-0 text-[13px]">
            <div className="flex-1">
              <b>{u.name}</b> <span className="text-muted">{u.email}</span>
            </div>
            <select className="field !w-auto !py-1 text-[12px]" value={u.role}
              onChange={(e) => wrap(api.setUserRole(u.id, e.target.value))}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        ))}
        <div className="mt-3 border-t border-line pt-3">
          <input className="field mb-1" placeholder="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
          <input className="field mb-1" placeholder="name" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} />
          <div className="flex gap-1">
            <select className="field !w-auto" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <input className="field" placeholder="temp password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
          </div>
          <button className="btn btn-primary w-full mt-2" disabled={!nu.email || !nu.name}
            onClick={() => wrap(api.createUser(nu)).then(() => setNu({ email: "", name: "", role: "user", password: "" }))}>
            Add user
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="card-h">Accounts</h2>
        {accounts.map((a) => <div key={a.id} className="py-1.5 border-b border-line last:border-0 text-[13px]"><b>{a.name}</b></div>)}
        <div className="mt-3 border-t border-line pt-3">
          <input className="field mb-1" placeholder="account name" value={na.name} onChange={(e) => setNa({ ...na, name: e.target.value })} />
          <input className="field mb-1" placeholder="Salesforce Account Id (optional)" value={na.sf} onChange={(e) => setNa({ ...na, sf: e.target.value })} />
          <button className="btn btn-primary w-full" disabled={!na.name}
            onClick={() => wrap(api.createAccount(na.name, na.sf || undefined)).then(() => setNa({ name: "", sf: "" }))}>
            Add account
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="card-h">Opportunities</h2>
        {opps.map((o) => <div key={o.id} className="py-1.5 border-b border-line last:border-0 text-[13px]"><b>{o.name}</b></div>)}
        <div className="mt-3 border-t border-line pt-3">
          <input className="field mb-1" placeholder="opportunity name" value={no.name} onChange={(e) => setNo({ ...no, name: e.target.value })} />
          <select className="field mb-1" value={no.account_id} onChange={(e) => setNo({ ...no, account_id: e.target.value })}>
            <option value="">select account…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input className="field mb-1" placeholder="Notion page URL (optional)" value={no.notion} onChange={(e) => setNo({ ...no, notion: e.target.value })} />
          <button className="btn btn-primary w-full" disabled={!no.name || !no.account_id}
            onClick={() => wrap(api.createOpportunity({ name: no.name, account_id: no.account_id, notion_page_ref: no.notion || undefined })).then(() => setNo({ name: "", account_id: "", notion: "" }))}>
            Add opportunity
          </button>
        </div>
      </div>
      {err && <div className="text-brand-orange-deep text-[13px]">{err}</div>}
    </div>
  );
}
