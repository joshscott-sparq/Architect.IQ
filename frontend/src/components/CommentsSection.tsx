import { useEffect, useState } from "react";
import { api } from "../api";

export function CommentsSection({ estimateId, canComment }: { estimateId: string; canComment: boolean }) {
  const [comments, setComments] = useState<{ author: string; body: string }[]>([]);
  const [body, setBody] = useState("");

  function refresh() {
    api.listComments(estimateId).then(setComments).catch(() => {});
  }
  useEffect(refresh, [estimateId]);

  async function post() {
    if (!body.trim()) return;
    await api.addComment(estimateId, body.trim());
    setBody("");
    refresh();
  }

  return (
    <>
      {comments.length === 0 && <p className="text-muted text-[13px] m-0">No comments yet.</p>}
      {comments.map((c, i) => (
        <div key={i} className="text-[13px] py-1.5 border-b border-line last:border-0">
          <b>{c.author}</b>: {c.body}
        </div>
      ))}
      {canComment && (
        <div className="flex gap-1 mt-2">
          <input className="field" placeholder="Add a comment" value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && post()} />
          <button className="btn" onClick={post} disabled={!body.trim()}>Post</button>
        </div>
      )}
    </>
  );
}
