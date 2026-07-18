import { useState, type ReactNode } from "react";
import { Modal } from "./Modal";

// Collapsible card section — click the header to expand/collapse, or the ⤢ button
// to open the section's content in a modal (with a full-screen option).
export function Section({
  title,
  actions,
  defaultOpen = true,
  expandable = true,
  children,
}: {
  title: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
  expandable?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card">
      <div className="section-head" onClick={() => setOpen((o) => !o)}>
        <span className="section-caret" style={{ transform: open && !expanded ? "rotate(90deg)" : "none" }}>▸</span>
        <h2 className="card-h mb-0">{title}</h2>
        <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {actions}
          {expandable && (
            <button className="text-muted hover:text-brand-orange px-1.5 py-0.5 text-[15px] leading-none" title="Expand" onClick={() => setExpanded(true)}>
              ⤢
            </button>
          )}
        </div>
      </div>
      {open && !expanded && <div className="mt-3">{children}</div>}
      {expanded && <div className="mt-3 text-muted text-[13px]">Opened in a modal — close it to restore this panel.</div>}
      {expanded && <Modal title={title} onClose={() => setExpanded(false)}>{children}</Modal>}
    </div>
  );
}
