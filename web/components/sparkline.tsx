// Tiny trend line for tables and cards. Pure SVG, no dependency. Gives a text alternative via `label`.
export function Sparkline({
  values,
  width = 96,
  height = 28,
  label,
  className = "text-primary",
}: {
  values: (number | null | undefined)[];
  width?: number;
  height?: number;
  label?: string;
  className?: string;
}) {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (v.length < 2) {
    return (
      <svg width={width} height={height} role="img" aria-label={label ?? "Not enough sessions for a trend"} className="text-border">
        <line x1="2" x2={width - 2} y1={height / 2} y2={height / 2} stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 4" />
      </svg>
    );
  }
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const span = hi - lo || 1;
  const pad = 3;
  const pts = v.map((y, i) => [pad + (i * (width - 2 * pad)) / (v.length - 1), height - pad - ((y - lo) / span) * (height - 2 * pad)] as const);
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} role="img" aria-label={label ?? "Trend over sessions"} className={className}>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill="var(--brass)" />
    </svg>
  );
}
