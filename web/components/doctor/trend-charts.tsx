"use client";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Schemas } from "@/lib/api";
import { fmtDate } from "./format";

type Session = Schemas["SessionOut"];
type Assessment = Schemas["AssessmentOut"];

const METRICS: { key: keyof Session; title: string; unit: string }[] = [
  { key: "mean_quality", title: "Movement quality score", unit: "" },
  { key: "mean_roll_range_deg", title: "Roll range", unit: "deg" },
  { key: "mean_pitch_range_deg", title: "Pitch range", unit: "deg" },
  { key: "mean_duration_s", title: "Rep duration", unit: "s" },
  { key: "mean_speed_peaks", title: "Speed peaks per rep", unit: "" },
];

const day = (s: string) => new Date(s).getTime();

export function TrendCharts({ sessions, assessments }: { sessions: Session[]; assessments: Assessment[] }) {
  if (sessions.length === 0) return <p className="text-sm text-muted-foreground">No sessions recorded yet.</p>;
  const sorted = [...sessions].sort((a, b) => day(a.started_at) - day(b.started_at));
  const marks = assessments.map((a) => ({ ts: day(a.assessed_on), overall: a.rubric.overall }));
  const all = [...sorted.map((s) => day(s.started_at)), ...marks.map((m) => m.ts)];
  const domain: [number, number] = [Math.min(...all), Math.max(...all)];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {METRICS.map((m, i) => {
        const data = sorted.map((s) => ({ ts: day(s.started_at), v: s[m.key] as number | null }));
        return (
          <figure key={m.key} className="rounded-lg border bg-card p-3 break-inside-avoid">
            <figcaption className="mb-2 text-sm font-medium">
              {m.title}
              {m.unit && <span className="text-muted-foreground"> ({m.unit})</span>}
              {i === 0 && marks.length > 0 && <span className="text-muted-foreground"> with your overall marks (dashed)</span>}
            </figcaption>
            <div className="h-48" role="img" aria-label={`${m.title} per session, ${data.length} sessions`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="ts" type="number" scale="time" domain={domain} tickFormatter={(t: number) => fmtDate(new Date(t).toISOString())} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={48} />
                  <Tooltip
                    labelFormatter={(t) => fmtDate(new Date(Number(t)).toISOString())}
                    formatter={(v) => [typeof v === "number" ? v.toFixed(1) : "n/a", m.title]}
                    contentStyle={{ background: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  {i === 0 &&
                    marks.map((k) => (
                      <ReferenceLine key={k.ts} x={k.ts} stroke="var(--chart-2)" strokeDasharray="4 3" label={{ value: `mark ${k.overall}/5`, position: "insideTopRight", fontSize: 10, fill: "var(--foreground)" }} />
                    ))}
                  <Line type="monotone" dataKey="v" stroke="var(--chart-4)" strokeWidth={2} dot={{ r: 3, fill: "var(--chart-4)" }} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </figure>
        );
      })}
    </div>
  );
}
