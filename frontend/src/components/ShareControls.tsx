import { useEffect, useState } from "react";
import { api } from "../api";

const PERMS = ["view", "comment", "edit"];

// Share controls (like Google Drive's share dialog): share by email or name at
// a permission level, and mint a public view-only link.
export function ShareControls({ estimateId }: { estimateId: string }) {
  const [shares, setShares] = useState<{ principal_email: string; permission: string }[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [principal, setPrincipal] = useState("");
  const [perm, setPerm] = useState("view");
  const [err, setErr] = useState<string | null>(null);

  function refresh() {
    api.listShares(estimateId).then((s) => {
      setShares(s.shares);
      if (s.links[0]) setLink(`${location.origin}/shared/${s.links[0].token}`);
    }).catch(() => {});
  }
  useEffect(refresh, [estimateId]);

  async function share() {
    setErr(null);
    try {
      await api.addShare(estimateId, principal, perm);
      setPrincipal("");
      refresh();
    } catch (e: any) {
      setErr(e?.message?.includes("no user found") ? "No user with that name — try an email." : "Could not share");
    }
  }

  async function makeLink() {
    const { token } = await api.createShareLink(estimateId);
    setLink(`${location.origin}/shared/${token}`);
  }

  return (
    <div className="w-[360px] max-w-[90vw]">
      <h3 className="text-sm font-semibold mb-2">Share estimate</h3>
      <div className="flex gap-1 mb-2">
        <input className="field" placeholder="email or name" value={principal} onChange={(e) => setPrincipal(e.target.value)} autoFocus />
        <select className="field !w-auto" value={perm} onChange={(e) => setPerm(e.target.value)}>
          {PERMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button className="btn btn-primary" onClick={share} disabled={!principal.trim()}>Share</button>
      </div>
      {err && <div className="text-brand-orange-deep text-[12px] mb-1">{err}</div>}
      {shares.map((s) => (
        <div key={s.principal_email} className="flex items-center gap-2 text-[13px] py-1 border-b border-line last:border-0">
          <span className="flex-1 truncate">{s.principal_email}</span>
          <span className="badge bg-brand-mint text-brand-sage">{s.permission}</span>
          <button className="text-muted text-[12px] hover:text-brand-orange-deep" onClick={() => api.removeShare(estimateId, s.principal_email).then(refresh)}>remove</button>
        </div>
      ))}
      <div className="mt-3 border-t border-line pt-3">
        <button className="btn text-[12px]" onClick={makeLink}>Create public view-only link</button>
        {link && <input className="field text-[12px] mt-1" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />}
      </div>
    </div>
  );
}
