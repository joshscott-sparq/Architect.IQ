import { useEffect, useState, type ReactNode } from "react";

// Expand-to-modal with a full-screen toggle. Closes on backdrop click or Escape.
export function Modal({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const [full, setFull] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/50 fade-in" onClick={onClose} />
      <div className={"relative bg-surface border border-line rounded-2xl shadow-2xl flex flex-col pop-in " + (full ? "w-full h-full" : "w-full max-w-5xl max-h-[85vh]")}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
          <div className="card-h mb-0 truncate">{title}</div>
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <button className="btn text-[12px] px-2 py-1" onClick={() => setFull((f) => !f)} title={full ? "Exit full screen" : "Full screen"}>
              {full ? "⤡ Exit full screen" : "⤢ Full screen"}
            </button>
            <button className="btn text-[12px] px-2.5 py-1" onClick={onClose} title="Close (Esc)">✕</button>
          </div>
        </div>
        <div className="overflow-auto p-4 sm:p-6 flex-1">{children}</div>
      </div>
    </div>
  );
}
