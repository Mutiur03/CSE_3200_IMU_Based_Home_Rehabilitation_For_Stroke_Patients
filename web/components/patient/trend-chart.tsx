"use client";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type Series = { key: string; label: string; color: string };

/** Line chart over sessions. `rows` need an `x` label plus one numeric (or null) field per series key. */
export function TrendChart({ title, unit, rows, series: all }: { title: string; unit: string; rows: Record<string, string | number | null | undefined>[]; series: Series[] }) {
  // A flat series has no shape to show: say so in words instead of drawing a line on a degenerate axis.
  const notes: string[] = [];
  const series = all.filter((s) => {
    const v = rows.map((r) => r[s.key]).filter((x): x is number => typeof x === "number");
    if (v.length === 0 || v.every((x) => x === 0)) notes.push(`No ${s.label.toLowerCase()} movement recorded yet`);
    else if (v.every((x) => x === v[0])) notes.push(`${s.label} steady at ${v[0]}${unit}`);
    else return true;
    return false;
  });
  return (
    <figure>
      <figcaption className="mb-3 text-lg font-medium">{title}</figcaption>
      {notes.map((n) => <p key={n} className="mb-2 text-muted-foreground">{n}</p>)}
      {series.length > 0 && <div role="img" aria-label={`${title} over sessions (${unit.trim() || "score"})`} className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="x" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} interval="preserveStartEnd" minTickGap={32} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
            <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} unit={unit} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ stroke: "var(--border)" }} contentStyle={{ background: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "none", fontSize: 14 }} />
            {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 14 }} />}
            {series.map((s) => (
              <Line key={s.key} type="linear" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: s.color }} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>}
    </figure>
  );
}
