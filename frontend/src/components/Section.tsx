import { useState, type ReactNode } from "react";

// Collapsible card section — click the header to expand/collapse.
export function Section({
  title,
  actions,
  defaultOpen = true,
  children,
}: {
  title: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card">
      <div className="section-head" onClick={() => setOpen((o) => !o)}>
        <span className="section-caret" style={{ transform: open ? "rotate(90deg)" : "none" }}>▸</span>
        <h2 className="card-h mb-0">{title}</h2>
        {actions && (
          <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
