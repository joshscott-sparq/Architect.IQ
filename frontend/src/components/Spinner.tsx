// Small inline spinner for "this is going to take a moment" states —
// pair with the busy-state text it replaces/precedes (e.g. "Saving…").
export function Spinner({ className = "" }: { className?: string }) {
  return <span className={"spinner " + className} role="status" aria-label="Loading" />;
}
