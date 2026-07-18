import { useEffect, useState } from "react";
import { api } from "../api";

const PERMS = ["view", "comment", "edit"];

export function SharePanel({ estimateId, canEdit, canComment }: { estimateId: string; canEdit: boolean; canComment: boolean }) {
  const [shares, setShares] = useState<{ principal_email: string; permission: string }[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [principal, setPrincipal] = useState("");
  const [perm, setPerm] = useState("view");
  const [comments, setComments] = useState<{ author: string; body: string }[]>([]);
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function refresh() {
    if (canEdit) {
      api.listShares(estimateId).then((s) => {
        setShares(s.shares);
        if (s.links[0]) setLink(`${location.origin}/shared/${s.links[0].token}`);
      }).catch(() => {});
    }
    api.listComments(estimateId).then(setComments).catch(() => {});
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

  async function comment() {
    if (!body.trim()) return;
    await api.addComment(estimateId, body.trim());
    setBody("");
    refresh();
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {canEdit && (
        <div>
          <h3 className="text-[13px] font-semibold mb-1">Share</h3>
          <div className="flex gap-1 mb-2">
            <input className="field" placeholder="email or name" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
            <select className="field !w-auto" value={perm} onChange={(e) => setPerm(e.target.value)}>
              {PERMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button className="btn" onClick={share} disabled={!principal.trim()}>Share</button>
          </div>
          {err && <div className="text-brand-orange-deep text-[12px] mb-1">{err}</div>}
          {shares.map((s) => (
            <div key={s.principal_email} className="flex items-center gap-2 text-[13px] py-1 border-b border-line last:border-0">
              <span className="flex-1">{s.principal_email}</span>
              <span className="badge bg-brand-mint text-brand-sage">{s.permission}</span>
              <button className="text-muted text-[12px] hover:text-brand-orange-deep" onClick={() => api.removeShare(estimateId, s.principal_email).then(refresh)}>remove</button>
            </div>
          ))}
          <div className="mt-3">
            <button className="btn text-[12px]" onClick={makeLink}>Create public view-only link</button>
            {link && (
              <div className="text-[12px] mt-1 break-all">
                <input className="field text-[12px]" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              </div>
            )}
          </div>
        </div>
      )}
      <div>
        <h3 className="text-[13px] font-semibold mb-1">Comments</h3>
        {comments.length === 0 && <p className="text-muted text-[13px] m-0">No comments yet.</p>}
        {comments.map((c, i) => (
          <div key={i} className="text-[13px] py-1.5 border-b border-line last:border-0">
            <b>{c.author}</b>: {c.body}
          </div>
        ))}
        {canComment && (
          <div className="flex gap-1 mt-2">
            <input className="field" placeholder="Add a comment" value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && comment()} />
            <button className="btn" onClick={comment} disabled={!body.trim()}>Post</button>
          </div>
        )}
      </div>
    </div>
  );
}
