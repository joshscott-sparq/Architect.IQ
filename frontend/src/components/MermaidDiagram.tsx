import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "base",
  themeVariables: {
    primaryColor: "#fff4f1",
    primaryBorderColor: "#e75437",
    primaryTextColor: "#231a17",
    lineColor: "#667e66",
    fontFamily: "IBM Plex Sans, system-ui, sans-serif",
  },
});

let counter = 0;

export function MermaidDiagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${counter++}`;
    mermaid
      .render(id, code)
      .then(({ svg }) => {
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) return <div className="error">Diagram error: {error}</div>;
  return <div className="mermaid-wrap" ref={ref} />;
}
