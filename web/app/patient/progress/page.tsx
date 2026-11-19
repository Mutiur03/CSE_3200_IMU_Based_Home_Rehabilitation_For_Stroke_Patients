import type { Metadata } from "next";
import { TrendChart } from "@/components/patient/trend-chart";
import { fmtDay, num } from "@/components/patient/util";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { load, requireRole } from "@/lib/server-api";

export const metadata: Metadata = { title: "My progress" };

export default async function ProgressPage() {
  const { id } = await requireRole("patient");
  const { sessions, improvement, assessments } = await load((api) => api.GET("/api/patients/{patient_id}/progress", { params: { path: { patient_id: id } } }));
  const finished = sessions.filter((s) => s.ended_at).sort((a, b) => a.started_at.localeCompare(b.started_at));
  const multiYear = new Set(finished.map((s) => new Date(s.started_at).getFullYear())).size > 1;
  const rows = finished.map((s) => ({
    x: fmtDay(s.started_at, multiYear),
    quality: s.mean_quality,
    roll: s.mean_roll_range_deg,
    pitch: s.mean_pitch_range_deg,
    duration: s.mean_duration_s,
  }));

  return (
    <div>
      <PageHeader title="My progress" />

      <section aria-labelledby="imp-h" className="grid gap-8 md:grid-cols-[auto_1fr] md:gap-16">
        {improvement.index == null ? (
          <div>
            <h2 id="imp-h" className="text-[1.75rem] leading-tight">Improvement index</h2>
            <p className="mt-3 text-muted-foreground">Not enough sessions yet. Finish a few sessions and it will appear here.</p>
          </div>
        ) : (
          <div>
            <h2 id="imp-h" className="sr-only">Improvement index</h2>
            <Stat label="Improvement index" value={`${num(improvement.index, 1)} %`} tone="brass" size="lg" />
          </div>
        )}
        <div>
          {improvement.metrics.length > 0 && (
            <ul className="grid gap-2 border-t border-border pt-4 md:border-t-0 md:pt-0">
              {improvement.metrics.map((m) => (
                <li key={m.name} className="flex flex-wrap justify-between gap-x-6">
                  <span className="first-letter:uppercase">{m.name.replace("_", " ")}</span>
                  <span className="tnum text-muted-foreground">{num(m.baseline, 1)} to {num(m.current, 1)} ({m.improvement_pct >= 0 ? "+" : ""}{num(m.improvement_pct, 1)} %)</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-base text-muted-foreground">{improvement.note}</p>
        </div>
      </section>

      <section aria-labelledby="charts-h" className="mt-14 border-t border-border pt-10">
        <h2 id="charts-h" className="mb-6 text-[1.75rem] leading-tight">Session by session</h2>
        {rows.length === 0 ? (
          <p className="text-muted-foreground">No finished sessions yet. Your charts will appear after your first session.</p>
        ) : (
          <div className="grid gap-12">
            <TrendChart title="Movement quality score" unit="" rows={rows} series={[{ key: "quality", label: "Quality", color: "var(--primary)" }]} />
            <TrendChart title="Range of movement" unit="°" rows={rows} series={[{ key: "roll", label: "Roll range", color: "var(--chart-1)" }, { key: "pitch", label: "Pitch range", color: "var(--chart-3)" }]} />
            <TrendChart title="Time per repetition" unit=" s" rows={rows} series={[{ key: "duration", label: "Duration", color: "var(--primary)" }]} />
          </div>
        )}
      </section>

      <section aria-labelledby="marks-h" className="mt-14 border-t border-border pt-10">
        <h2 id="marks-h" className="mb-6 text-[1.75rem] leading-tight">My doctor&apos;s marks</h2>
        {assessments.length === 0 && <p className="text-muted-foreground">Your doctor has not marked a session yet.</p>}
        <div className="grid gap-0">
          {assessments.map((a) => (
            <div key={a.id} className="grid gap-1 border-b border-border py-5 first:pt-0 last:border-0">
              <p className="font-medium">{new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(a.assessed_on + "T00:00"))}</p>
              <p>Range {a.rubric.range}, smoothness {a.rubric.smoothness}, control {a.rubric.control}, adherence {a.rubric.adherence}, overall {a.rubric.overall} (each 1 to 5)</p>
              {a.scale_name && <p>{a.scale_name}: {a.scale_score ?? "-"}</p>}
              {a.comment && <p className="text-muted-foreground">{a.comment}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
