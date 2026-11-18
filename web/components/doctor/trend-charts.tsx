"use client";
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Schemas } from "@/lib/api";
import { fmtDate, spansYears } from "./format";

type Session = Schemas["SessionOut"];
type Assessment = Schemas["AssessmentOut"];

const METRICS: {
  key: keyof Session;
  title: string;
  unit: string;
  none: string;
}[] = [
  {
    key: "mean_quality",
    title: "Movement quality score",
    unit: "",
    none: "No quality scores recorded",
  },
  {
    key: "mean_roll_range_deg",
    title: "Roll range",
    unit: "deg",
    none: "No roll movement recorded",
  },
  {
    key: "mean_pitch_range_deg",
    title: "Pitch range",
    unit: "deg",
    none: "No pitch movement recorded",
  },
  {
    key: "mean_duration_s",
    title: "Rep duration",
    unit: "s",
    none: "No rep duration recorded",
  },
  {
    key: "mean_speed_peaks",
    title: "Speed peaks per rep",
    unit: "",
    none: "No speed peaks recorded",
  },
];

const day = (s: string) => new Date(s).getTime();
const AXIS = { fontSize: 12, fill: "var(--muted-foreground)" };

export function TrendCharts({ sessions, assessments }: { sessions: Session[]; assessments: Assessment[] }) {
  if (sessions.length === 0) return <p className="text-sm text-muted-foreground">No sessions recorded yet.</p>;
  const sorted = [...sessions].sort((a, b) => day(a.started_at) - day(b.started_at));
  const marks = assessments.map((a) => ({
    ts: day(a.assessed_on),
    overall: a.rubric.overall,
  }));
  const all = [...sorted.map((s) => day(s.started_at)), ...marks.map((m) => m.ts)];
  const domain: [number, number] = [Math.min(...all), Math.max(...all)];
  const yr = spansYears(all);
  const fmt = (t: number) => fmtDate(new Date(t).toISOString(), yr);

  return (
    <div>
      <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
        {METRICS.map((m, i) => {
          const data = sorted.map((s) => ({
            ts: day(s.started_at),
            v: s[m.key] as number | null,
          }));
          const last = [...data].reverse().find((d) => typeof d.v === "number");
          const vals = data.filter((d) => typeof d.v === "number").map((d) => d.v as number);
          const lo = Math.min(...vals),
            hi = Math.max(...vals);
          const flat = vals.length === 0 || hi === lo;
          const pad = (hi - lo) * 0.12 || 1;
          const yDomain: [number, number] = [lo - pad, hi + pad];
          const tickTop = yDomain[1],
            tickLen = (yDomain[1] - yDomain[0]) * 0.1;
          return (
            <figure key={m.key} className={`break-inside-avoid ${i === METRICS.length - 1 ? "md:col-span-2" : ""}`}>
              <figcaption className="mb-2 flex items-baseline justify-between gap-3 border-b border-border pb-2">
                <span className="text-[0.8125rem] font-medium">
                  {m.title}
                  {m.unit && <span className="font-normal text-muted-foreground"> ({m.unit})</span>}
                </span>
                <span className="font-display tnum text-xl leading-none">{last ? (last.v as number).toFixed(1) : "n/a"}</span>
              </figcaption>
              {flat ? (
                <p className="flex h-44 items-center justify-center text-sm text-muted-foreground">
                  {vals.length === 0 || hi === 0 ? m.none : `Steady at ${hi.toFixed(1)}${m.unit ? ` ${m.unit}` : ""}`}
                </p>
              ) : (
                <div className="h-44" role="img" aria-label={`${m.title} per session, ${data.length} sessions${last ? `, latest ${(last.v as number).toFixed(1)}` : ""}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="ts" type="number" scale="time" domain={domain} tickFormatter={fmt} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={32} />
                      <YAxis domain={yDomain} tickFormatter={(v: number) => String(Math.round(v * 10) / 10)} tick={AXIS} tickLine={false} axisLine={false} width={48} />
                      <Tooltip
                        cursor={{ stroke: "var(--border)" }}
                        labelFormatter={(t) => fmt(Number(t))}
                        formatter={(v) => [typeof v === "number" ? v.toFixed(1) : "n/a", m.title]}
                        contentStyle={{
                          background: "var(--popover)",
                          color: "var(--popover-foreground)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                          boxShadow: "none",
                        }}
                      />
                      {i === 0 &&
                        marks.map((k) => (
                          <ReferenceLine
                            key={k.ts}
                            segment={[
                              { x: k.ts, y: tickTop },
                              { x: k.ts, y: tickTop - tickLen },
                            ]}
                            stroke="var(--chart-2)"
                            strokeWidth={2.5}
                          />
                        ))}
                      <Line
                        type="monotone"
                        dataKey="v"
                        stroke="var(--chart-1)"
                        strokeWidth={1.75}
                        dot={false}
                        activeDot={{
                          r: 3,
                          fill: "var(--chart-1)",
                          stroke: "none",
                        }}
                        connectNulls
                        isAnimationActive={false}
                      />
                      {last && <ReferenceDot x={last.ts} y={last.v as number} r={4} fill="var(--chart-2)" stroke="var(--card)" strokeWidth={1.5} />}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </figure>
          );
        })}
      </div>
      {marks.length > 0 && <p className="mt-6 text-[0.8125rem] text-muted-foreground">Brass ticks on the quality chart: overall clinician marks, 1 to 5.</p>}
    </div>
  );
}
