export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initial = (name.trim()[0] || "?").toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}>
      {initial}
    </span>
  );
}
