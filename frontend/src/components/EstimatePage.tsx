import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import type { ContextPanel as Panel, EstimateResponse } from "../types";
import { ContextPanel } from "./ContextPanel";
import { EstimateView } from "./EstimateView";

const EMPTY_PANEL: Panel = { requirements: [], risks: [], accelerators: [], assumptions: [], phases: [], external_sources: [] };

export function EstimatePage({ isClient, ctxCollapsed, onToggleCtx }: {
  isClient: boolean;
  ctxCollapsed: boolean;
  onToggleCtx: () => void;
}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [current, setCurrent] = useState<EstimateResponse | null>(null);
  const [access, setAccess] = useState<{ can_edit: boolean; can_comment: boolean }>({ can_edit: true, can_comment: true });
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!id) return;
    setCurrent(null);
    setError(null);
    Promise.all([api.getEstimate(id), api.access(id).catch(() => ({ can_edit: false, can_comment: false }))])
      .then(([est, acc]) => { setCurrent(est); setAccess({ can_edit: acc.can_edit, can_comment: acc.can_comment }); })
      .catch((e) => setError(String(e)));
  }, [id]);

  if (error) return <div className="text-brand-orange-deep text-[13px]">{error}</div>;
  if (!current) return <div className="text-muted text-sm">Loading…</div>;

  return (
    <div>
      <nav className="text-[13px] text-muted mb-3">
        <Link to="/" className="hover:text-brand-orange">Estimates</Link>
        <span className="mx-1.5">/</span>
        <span className="text-ink font-medium">{current.graph.project_name}</span>
      </nav>
      <EstimateView
        key={current.estimate_id + "-" + current.version + "-" + nonce}
        initial={current}
        canEdit={access.can_edit}
        canComment={access.can_comment}
        canClone={!isClient}
        onClone={(cloneId) => navigate(`/estimates/${cloneId}`)}
      />
      <ContextPanel
        key={current.estimate_id}
        estimateId={current.estimate_id}
        initial={current.graph.context_panel ?? EMPTY_PANEL}
        canEdit={access.can_edit}
        collapsed={ctxCollapsed}
        onToggle={onToggleCtx}
        onRecalc={(e) => { setCurrent(e); setNonce((n) => n + 1); }}
      />
    </div>
  );
}
