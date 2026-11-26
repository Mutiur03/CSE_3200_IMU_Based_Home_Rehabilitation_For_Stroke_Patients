"use client";
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Schemas } from "@/lib/api";
import { fmtDate, fmtDateTime, spansYears } from "./format";

type Session = Schemas["SessionOut"];
type Assessment = Schemas["AssessmentOut"];

// Quality bands = the game's level rules (server/quality.py Q_UP / Q_DOWN). Keep in sync.
const Q_UP = 90;
const Q_DOWN = 60;

const METRICS: {
  key: keyof Session;
  title: string;
  hint: string;
  unit: string;
  none: string;
  force?: boolean;
}[] = [
  { key: "mean_quality", title: "Movement quality", hint: "0 to 100, higher is better. Dashed lines: level-up and easier-level rules.", unit: "", none: "No quality scores recorded" },
  { key: "mean_roll_range_deg", title: "Forearm rotation range", hint: "Palm up and down. Wider is better.", unit: "°", none: "No rotation recorded" },
  { key: "mean_pitch_range_deg", title: "Forearm raise range", hint: "Lifting up and down. Higher is better.", unit: "°", none: "No raising recorded" },
  { key: "mean_duration_s", title: "Time per repetition", hint: "Shorter is better.", unit: " s", none: "No repetition times recorded" },
  { key: "mean_speed_peaks", title: "Smoothness", hint: "Stop-start bursts per repetition. Fewer is smoother.", unit: "", none: "No smoothness recorded" },
  { key: "mean_peak_load_kg", title: "Grip and press force", hint: "Peak force per repetition on load cell levels. Higher is stronger.", unit: " kg", none: "No load cell sessions", force: true },
];
// A movement chart only uses movement sessions; a load cell session's repetition times would otherwise mix in.
const isMovement = (s: Session) => s.mean_quality != null || s.mean_roll_range_deg != null || s.mean_pitch_range_deg != null || s.mean_speed_peaks != null;

const day = (s: string) => new Date(s).getTime();
const AXIS = { fontSize: 12, fill: "var(--muted-foreground)" };

export function TrendCharts({ sessions, assessments }: { sessions: Session[]; assessments: Assessment[] }) {
  if (sessions.length === 0) return <p className="text-sm text-muted-foreground">No sessions recorded yet.</p>;
  const sorted = [...sessions].sort((a, b) => day(a.started_at) - day(b.started_at));
  const marks = assessments.map((a) => ({
    ts: day(a.assessed_on),
    overall: a.rubric.overall,
  }));
  const yr = spansYears([...sorted.map((s) => day(s.started_at)), ...marks.map((m) => m.ts)]);
  const fmt = (t: number) => fmtDate(new Date(t).toISOString(), yr);

  return (
    <div>
      <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
        {METRICS.map((m, i) => {
          // One point per session that has this measure, in order (x = session number, labelled with its date).
          // A time axis squashed same-day sessions into a vertical line.
          const data = sorted
            .filter((s) => (m.force || isMovement(s)) && typeof s[m.key] === "number")
            .map((s, j) => ({ n: j + 1, ts: day(s.started_at), v: s[m.key] as number }));
          if (m.force && data.length === 0) return null;
          const last = data[data.length - 1];
          const vals = data.map((d) => d.v);
          const lo = Math.min(...vals),
            hi = Math.max(...vals);
          const flat = vals.length < 2 || hi === lo;
          const pad = (hi - lo) * 0.12 || 1;
          const isQ = m.key === "mean_quality";
          // Quality: 0-100 scale, always showing the band lines so the trend reads against the game's rules.
          const yDomain: [number, number] = isQ ? [Math.max(0, Math.min(lo - pad, Q_DOWN - 10)), 100] : [Math.max(0, lo - pad), hi + pad];
          const atSession = (ts: number) => (data.find((d) => d.ts >= ts) ?? last)?.n;
          const tickTop = yDomain[1],
            tickLen = (yDomain[1] - yDomain[0]) * 0.1;
          return (
            <figure key={m.key} className="break-inside-avoid">
              <figcaption className="mb-2 flex items-baseline justify-between gap-3 border-b border-border pb-2">
                <span className="min-w-0">
                  <span className="block text-[0.9375rem] font-medium">{m.title}</span>
                  <span className="block text-[0.8125rem] text-muted-foreground">{m.hint}</span>
                </span>
                <span className="font-display tnum shrink-0 text-xl leading-none" title="Latest session">
                  {last ? `${(last.v as number).toFixed(1)}${m.unit}` : "n/a"}
                </span>
              </figcaption>
              {flat ? (
                <p className="flex h-44 items-center justify-center text-sm text-muted-foreground">
                  {vals.length === 0 ? m.none : vals.length === 1 ? `One session so far: ${hi.toFixed(1)}${m.unit}` : `Steady at ${hi.toFixed(1)}${m.unit}`}
                </p>
              ) : (
                <div className="h-44" role="img" aria-label={`${m.title} per session, ${data.length} sessions${last ? `, latest ${(last.v as number).toFixed(1)}` : ""}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="n"
                        type="number"
                        domain={[1, data.length]}
                        allowDecimals={false}
                        tickFormatter={(n: number) => (data[n - 1] ? fmt(data[n - 1].ts) : "")}
                        tick={AXIS}
                        tickLine={false}
                        axisLine={{ stroke: "var(--border)" }}
                        minTickGap={28}
                        padding={{ left: 8, right: 8 }}
                      />
                      <YAxis domain={yDomain} tickFormatter={(v: number) => String(Math.round(v))} tick={AXIS} tickLine={false} axisLine={false} width={40} />
                      <Tooltip
                        cursor={{ stroke: "var(--border)" }}
                        labelFormatter={(n) => (data[Number(n) - 1] ? `Session ${n}, ${fmtDateTime(new Date(data[Number(n) - 1].ts).toISOString())}` : "")}
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
                      {isQ && <ReferenceLine y={Q_UP} stroke="var(--moss)" strokeDasharray="4 4" label={{ value: "level up", position: "insideTopRight", fontSize: 11, fill: "var(--moss)" }} />}
                      {isQ && <ReferenceLine y={Q_DOWN} stroke="var(--amber)" strokeDasharray="4 4" label={{ value: "easier level", position: "insideBottomRight", fontSize: 11, fill: "var(--amber)" }} />}
                      {i === 0 &&
                        marks.map((k) => (
                          <ReferenceLine
                            key={k.ts}
                            segment={[
                              { x: atSession(k.ts), y: tickTop },
                              { x: atSession(k.ts), y: tickTop - tickLen },
                            ]}
                            stroke="var(--chart-2)"
                            strokeWidth={2.5}
                          />
                        ))}
                      <Line
                        type="linear"
                        dataKey="v"
                        stroke="var(--chart-1)"
                        strokeWidth={1.75}
                        dot={{ r: 2.5, fill: "var(--chart-1)", stroke: "none" }}
                        activeDot={{
                          r: 3,
                          fill: "var(--chart-1)",
                          stroke: "none",
                        }}
                        connectNulls
                        isAnimationActive={false}
                      />
                      {last && <ReferenceDot x={last.n} y={last.v} r={4} fill="var(--chart-2)" stroke="var(--card)" strokeWidth={1.5} />}
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
