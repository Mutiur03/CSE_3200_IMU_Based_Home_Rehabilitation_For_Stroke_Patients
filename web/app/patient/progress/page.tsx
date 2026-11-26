import type { Metadata } from "next";
import Link from "next/link";
import { ProgressCharts } from "@/components/patient/progress-charts";
import { fmtDate, fmtDay, num, weekStart } from "@/components/patient/util";
import { PageHeader } from "@/components/page-header";
import { load, loadOptional, requireRole } from "@/lib/server-api";

export const metadata: Metadata = { title: "My progress" };

const WINDOW = 3; // server/improvement.py: first 3 sessions vs last 3
// Plain-language names for the server's metric keys. `unit` is shown after the numbers.
const METRIC: Record<string, { label: string; hint: string; unit: string }> = {
  quality: { label: "Movement quality", hint: "score out of 100", unit: "" },
  roll_range: { label: "Turning your forearm", hint: "how far you turn, palm up and down", unit: "°" },
  pitch_range: { label: "Raising your forearm", hint: "how far you lift and lower", unit: "°" },
  duration: { label: "Time per repetition", hint: "shorter is better here", unit: " s" },
  speed_peaks: { label: "Smoothness", hint: "fewer speed bursts per repetition means smoother", unit: "" },
};
const RUBRIC: [keyof Rubric, string][] = [["range", "Range"], ["smoothness", "Smoothness"], ["control", "Control"], ["adherence", "Adherence"], ["overall", "Overall"]];
type Rubric = { range: number; smoothness: number; control: number; adherence: number; overall: number };

function Change({ pct }: { pct: number }) {
  const same = Math.abs(pct) < 1;
  const better = pct >= 1;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-base font-medium ${same ? "bg-muted text-muted-foreground" : better ? "bg-moss/12 text-moss" : "bg-amber/12 text-amber"}`}>
      <span aria-hidden>{same ? "=" : better ? "↑" : "↓"}</span>
      {same ? "About the same" : `${better ? "Better" : "Lower"} by ${Math.abs(pct).toFixed(0)} %`}
    </span>
  );
}

function Dots({ value, label }: { value: number; label: string }) {
  return (
    <span role="img" aria-label={`${label}: ${value} out of 5`} className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={`size-3 rounded-full ${i <= value ? "bg-primary" : "bg-border"}`} />)}
    </span>
  );
}

export default async function ProgressPage() {
  const { id } = await requireRole("patient");
  const [{ sessions, improvement, assessments }, plan] = await Promise.all([
    load((api) => api.GET("/api/patients/{patient_id}/progress", { params: { path: { patient_id: id } } })),
    loadOptional((api) => api.GET("/api/plan")),
  ]);
  const finished = sessions.filter((s) => s.ended_at).sort((a, b) => a.started_at.localeCompare(b.started_at));
  const multiYear = new Set(finished.map((s) => new Date(s.started_at).getFullYear())).size > 1;
  const rows = finished.map((s) => ({
    x: fmtDay(s.started_at, multiYear),
    quality: s.mean_quality,
    roll: s.mean_roll_range_deg,
    pitch: s.mean_pitch_range_deg,
    duration: s.mean_duration_s,
    load: s.mean_peak_load_kg == null ? null : Math.round(s.mean_peak_load_kg * 100) / 100,
  }));
  const recent = [...finished].reverse().slice(0, 6);
  const ws = weekStart();
  const thisWeek = finished.filter((s) => new Date(s.started_at) >= ws).length;
  const goal = plan?.sessions_per_week ?? 0;
  const needed = Math.max(0, 2 * WINDOW - finished.length);
  const withReps = finished.filter((s) => (s.n_reps ?? 0) > 0).length;
  const q = improvement.metrics.find((m) => m.name === "quality");
  const marks = [...assessments].sort((a, b) => b.assessed_on.localeCompare(a.assessed_on));

  return (
    <div className="max-w-4xl">
      <PageHeader title="My progress" description="How your movement is changing from one session to the next." />

      {finished.length === 0 ? (
        <section className="rounded-xl border border-border bg-card p-8">
          <h2 className="text-[1.75rem] leading-tight">Your first session is waiting</h2>
          <p className="mt-3 max-w-[52ch] text-muted-foreground">After you finish a session, your results and charts will show up here.</p>
          <Link href="/patient" className="mt-6 inline-flex min-h-14 items-center rounded-lg bg-primary px-7 text-base text-primary-foreground">Go to Home</Link>
        </section>
      ) : (
        <>
          {/* 1. The answer first: one sentence, one number. */}
          <section aria-labelledby="sum-h" className="rounded-xl border border-border bg-card p-6 md:p-8">
            <h2 id="sum-h" className="sr-only">Summary</h2>
            <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-[1.5rem] leading-snug md:text-[1.75rem]">
                  {improvement.index == null ? (
                    <>You have finished <strong className="font-medium">{finished.length}</strong> {finished.length === 1 ? "session" : "sessions"}. Keep going.</>
                  ) : q ? (
                    <>Your last {WINDOW} sessions scored <strong className="font-medium">{num(q.current)}</strong> on average{Math.abs(q.improvement_pct) < 1 ? ", about the same as when you started." : q.improvement_pct > 0 ? `, up from ${num(q.baseline)} when you started.` : `, down from ${num(q.baseline)} when you started.`}</>
                  ) : (
                    <>You have finished <strong className="font-medium">{finished.length}</strong> sessions.</>
                  )}
                </p>
                {improvement.index == null && (
                  <div className="mt-5 max-w-sm">
                    <p className="text-muted-foreground">
                      {needed > 0 ? `${needed} more ${needed === 1 ? "session" : "sessions"} until we can compare your first ${WINDOW} with your latest ${WINDOW}.` : `${withReps === 0 ? "None" : `Only ${withReps}`} of your ${finished.length} sessions ${withReps === 1 ? "has" : "have"} recorded repetitions. Finish a level's repetitions in each session so they can be compared.`}
                    </p>
                    <div role="progressbar" aria-label="Sessions toward first comparison" aria-valuemin={0} aria-valuemax={2 * WINDOW} aria-valuenow={Math.min(finished.length, 2 * WINDOW)} className="mt-3 h-2.5 overflow-hidden rounded-full bg-border">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(Math.min(finished.length, 2 * WINDOW) / (2 * WINDOW)) * 100}%` }} />
                    </div>
                  </div>
                )}
              </div>
              {goal > 0 && (
                <div className="md:border-l md:border-border md:pl-8">
                  <p className="text-base text-muted-foreground">This week</p>
                  <p className="font-display tnum mt-1 text-[2.5rem] leading-none">{thisWeek}<span className="text-[1.5rem] text-muted-foreground"> of {goal}</span></p>
                  <p className="mt-1 text-base text-muted-foreground">sessions done</p>
                  <div role="progressbar" aria-label="Sessions done this week" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(thisWeek, goal)} className="mt-3 h-2.5 w-44 overflow-hidden rounded-full bg-border">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(Math.min(thisWeek, goal) / goal) * 100}%` }} />
                  </div>
                  {thisWeek >= goal && <p className="mt-2 text-base font-medium text-moss">Weekly goal reached</p>}
                </div>
              )}
            </div>
          </section>

          {/* 2. What changed, in plain words. Only after 6 sessions (server rule). */}
          {improvement.metrics.length > 0 && (
            <section aria-labelledby="chg-h" className="mt-12">
              <h2 id="chg-h" className="text-[1.75rem] leading-tight">What has changed</h2>
              <p className="mt-2 text-muted-foreground">Your first {WINDOW} sessions compared with your latest {WINDOW}.</p>
              <ul className="mt-5 grid gap-3">
                {improvement.metrics.map((m) => {
                  const info = METRIC[m.name] ?? { label: m.name.replace(/_/g, " "), hint: "", unit: "" };
                  return (
                    <li key={m.name} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border border-border bg-card px-5 py-4">
                      <div className="min-w-0">
                        <p className="text-lg font-medium">{info.label}</p>
                        <p className="text-base text-muted-foreground">{info.hint}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="tnum text-base text-muted-foreground">{num(m.baseline, 1)}{info.unit} <span aria-hidden>→</span><span className="sr-only">to</span> <strong className="font-medium text-foreground">{num(m.current, 1)}{info.unit}</strong></p>
                        <Change pct={m.improvement_pct} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-base text-muted-foreground">{improvement.note}</p>
            </section>
          )}

          {/* 3. One chart at a time. */}
          <section aria-labelledby="charts-h" className="mt-12">
            <h2 id="charts-h" className="mb-5 text-[1.75rem] leading-tight">Session by session</h2>
            <ProgressCharts rows={rows} />
          </section>

          {/* 4. Recent sessions as a short list with a visual score bar. */}
          <section aria-labelledby="rec-h" className="mt-12">
            <h2 id="rec-h" className="mb-5 text-[1.75rem] leading-tight">Recent sessions</h2>
            <ul className="grid gap-3">
              {recent.map((s) => (
                <li key={s.id} className="grid items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-5 py-4 sm:grid-cols-[1fr_auto_10rem]">
                  <p className="font-medium">{fmtDate(s.started_at)}</p>
                  <p className="tnum text-base text-muted-foreground">{s.n_reps ?? 0} repetitions{s.mean_peak_load_kg != null && <>, peak force {num(s.mean_peak_load_kg, 1)} kg</>}</p>
                  <div className="flex items-center gap-3">
                    <div role="img" aria-label={`Quality ${num(s.mean_quality)} out of 100`} className="h-2.5 flex-1 overflow-hidden rounded-full bg-border">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, s.mean_quality ?? 0))}%` }} />
                    </div>
                    <span className="tnum w-8 text-right text-lg font-medium">{num(s.mean_quality)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {/* 5. Doctor's marks: five labelled dot meters instead of a sentence of numbers. */}
      <section aria-labelledby="marks-h" className="mt-12">
        <h2 id="marks-h" className="mb-5 text-[1.75rem] leading-tight">My doctor&apos;s marks</h2>
        {marks.length === 0 && <p className="text-muted-foreground">Your doctor has not marked a session yet.</p>}
        <div className="grid gap-4">
          {marks.map((a) => (
            <article key={a.id} className="rounded-xl border border-border bg-card p-5 md:p-6">
              <h3 className="text-lg font-medium">{new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(a.assessed_on + "T00:00"))}</h3>
              <dl className="mt-4 grid gap-x-10 gap-y-3 sm:grid-cols-2">
                {RUBRIC.map(([k, label]) => (
                  <div key={k} className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="flex items-center gap-3"><Dots value={a.rubric[k]} label={label} /><span className="tnum w-8 text-base">{a.rubric[k]}/5</span></dd>
                  </div>
                ))}
              </dl>
              {a.scale_name && <p className="mt-4 text-base"><span className="text-muted-foreground">{a.scale_name}:</span> <strong className="font-medium">{a.scale_score ?? "-"}</strong></p>}
              {a.comment && <p className="mt-4 border-t border-border pt-4">{a.comment}</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
