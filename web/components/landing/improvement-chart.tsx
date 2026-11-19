// Sample data, drawn the way the doctor's progress page works: baseline = median of the first 3 sessions, current = median of the last 3.
const Q = [58, 62, 60, 66, 71, 69, 76, 78, 81];
const W = 560;
const H = 300;
const L = 44;
const R = 16;
const T = 40;
const B = 50;

const median = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];

export function ImprovementChart() {
  const base = median(Q.slice(0, 3));
  const cur = median(Q.slice(-3));
  const pct = Math.round(((cur - base) / base) * 100);
  const x = (i: number) => L + (i * (W - L - R)) / (Q.length - 1);
  const y = (v: number) => T + ((90 - v) * (H - T - B)) / 50;
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sample chart: mean movement quality across nine sessions rises from a baseline median of ${base} to a current median of ${cur}.`} className="block h-auto w-full">
        {[40, 60, 80].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeDasharray="2 6" />
            <text x={L - 8} y={y(g) + 4} textAnchor="end" fontSize="14" fill="var(--muted-foreground)">{g}</text>
          </g>
        ))}
        <rect x={x(0) - 14} y={T} width={x(2) - x(0) + 28} height={H - T - B} fill="var(--primary)" opacity="0.07" />
        <rect x={x(6) - 14} y={T} width={x(8) - x(6) + 28} height={H - T - B} fill="var(--brass)" opacity="0.12" />
        <line x1={x(0) - 10} x2={x(2) + 10} y1={y(base)} y2={y(base)} stroke="var(--primary)" strokeWidth="2" />
        <line x1={x(6) - 10} x2={x(8) + 10} y1={y(cur)} y2={y(cur)} stroke="var(--brass-ink)" strokeWidth="2" />
        <polyline points={Q.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke="var(--foreground)" strokeWidth="1.6" strokeLinejoin="round" />
        {Q.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r="4" fill={i < 3 ? "var(--primary)" : i > 5 ? "var(--brass)" : "var(--card)"} stroke="var(--foreground)" strokeWidth="1.4" />
        ))}
        <text x={x(1)} y={H - 14} textAnchor="middle" fontSize="14" fill="var(--primary)">first 3 sessions</text>
        <text x={x(7)} y={H - 14} textAnchor="middle" fontSize="14" fill="var(--brass-ink)">last 3 sessions</text>
        <text x={x(1)} y={T - 12} textAnchor="middle" fontSize="14" fill="var(--primary)">median {base}</text>
        <text x={x(7)} y={T - 12} textAnchor="middle" fontSize="14" fill="var(--brass-ink)">median {cur}</text>
      </svg>
      <figcaption className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <span className="font-display tnum text-[2.5rem] leading-none">+{pct}%</span>
        <span className="max-w-[44ch] text-[0.8125rem] leading-relaxed text-muted-foreground">
          Sample data, one metric. The improvement index averages five metrics against the patient&apos;s own baseline and needs at least six sessions. Descriptive only, not clinically validated.
        </span>
      </figcaption>
    </figure>
  );
}
