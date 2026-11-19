import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { spansYears, fmtDate, fmtDateTime, fmtNum, fmtPct, metricLabel } from "./format";
import type { Schemas } from "@/lib/api";
import { PrintButton } from "./print-button";
import { TrendCharts } from "./trend-charts";

// Printed-document table styles: 32px rows, hairline rules, tabular numerals.
const th = "h-8 px-2 text-[0.8125rem] font-medium text-muted-foreground print:text-neutral-600";
const thr = `${th} text-right`;
const td = "h-8 px-2 py-0 tnum";
const tdr = `${td} text-right`;
const rowCls = "hover:bg-transparent print:break-inside-avoid";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-5 print:break-inside-avoid-page">
      <h2 className="mb-4 text-xl">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.8125rem] text-muted-foreground print:text-neutral-600">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

export function PatientReport({ id, d, progress: g }: { id: number; d: Schemas["PatientDetail"]; progress: Schemas["Progress"] }) {
  const imp = g.improvement;
  const sessions = [...g.sessions].sort((a, b) => a.started_at.localeCompare(b.started_at));
  const marks = [...g.assessments].sort((a, b) => b.assessed_on.localeCompare(a.assessed_on));
  const yr = spansYears([...sessions.map((x) => x.started_at), ...marks.map((m) => m.assessed_on)]);
  const period = sessions.length ? `${fmtDate(sessions[0].started_at, yr)} to ${fmtDate(sessions[sessions.length - 1].started_at, yr)}` : "no sessions";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/doctor/patients/${id}`}
          className="-ml-1 inline-flex min-h-11 items-center rounded-sm px-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Back to patient
        </Link>
        <div className="flex gap-2">
          <a href={`/api/patients/${id}/reps.csv`} download className={buttonVariants({ variant: "outline" })}>
            Download CSV
          </a>
          <PrintButton />
        </div>
      </div>

      <article className="space-y-8 rounded-xl border border-border bg-card px-6 py-8 text-[0.9375rem] sm:px-12 sm:py-12 print:space-y-6 print:rounded-none print:border-0 print:bg-white print:p-0 print:text-[10pt] print:text-black">
        <header>
          <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
            <Wordmark />
            <p className="text-[0.8125rem] text-muted-foreground print:text-neutral-600">Rehabilitation progress report</p>
          </div>
          <h1 className="mt-8 text-[2.25rem] leading-[1.1] sm:text-[2.75rem] print:text-[26pt]"><Link href={`/doctor/patients/${id}`} className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring print:no-underline">{d.name}</Link></h1>
          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            <Fact label="Period" value={period} />
            <Fact label="Sessions" value={<span className="tnum">{d.sessions_total}</span>} />
            <Fact label="Mean movement quality score" value={<span className="tnum">{fmtNum(d.mean_quality)}</span>} />
            <Fact label="Device" value={d.device_id ?? "none"} />
            <Fact label="Email" value={<span className="break-all">{d.email}</span>} />
            <Fact label="Affected side" value={d.affected_side ?? "not recorded"} />
            <Fact label="Onset" value={d.onset_date ? fmtDate(d.onset_date, true) : "not recorded"} />
          </dl>
        </header>

        <Section title="Sessions">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions recorded.</p>
          ) : (
            <Table className="text-sm">
              <TableHeader>
                <TableRow className={rowCls}>
                  <TableHead className={th}>Date</TableHead>
                  <TableHead className={thr}>Reps</TableHead>
                  <TableHead className={thr}>Mean quality</TableHead>
                  <TableHead className={thr}>Roll range</TableHead>
                  <TableHead className={thr}>Pitch range</TableHead>
                  <TableHead className={thr}>Duration (s)</TableHead>
                  <TableHead className={thr}>Dropped packets</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id} className={rowCls}>
                    <TableCell className={td}>{fmtDateTime(s.started_at)}</TableCell>
                    <TableCell className={tdr}>{s.n_reps ?? "n/a"}</TableCell>
                    <TableCell className={tdr}>{fmtNum(s.mean_quality)}</TableCell>
                    <TableCell className={tdr}>{fmtNum(s.mean_roll_range_deg)}</TableCell>
                    <TableCell className={tdr}>{fmtNum(s.mean_pitch_range_deg)}</TableCell>
                    <TableCell className={tdr}>{fmtNum(s.mean_duration_s)}</TableCell>
                    <TableCell className={tdr}>{s.dropped_packets ?? "n/a"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>

        <Section title="Trends">
          <TrendCharts sessions={g.sessions} assessments={g.assessments} />
        </Section>

        <Section title="Improvement index">
          <div className="break-inside-avoid">
            <p className="font-display tnum text-[3rem] leading-none text-brass-ink print:text-black">{imp.index == null ? "n/a" : fmtPct(imp.index)}</p>
            <p className="mt-3 text-[0.8125rem] text-muted-foreground print:text-neutral-600">
              Baseline: first {imp.baseline_sessions} sessions. Current: last {imp.current_sessions} sessions.
            </p>
            <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground print:text-neutral-700">{imp.note}</p>
            {imp.metrics.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">Not enough sessions yet to compare a baseline with a current window.</p>
            ) : (
              <div className="mt-5">
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow className={rowCls}>
                      <TableHead className={th}>Metric</TableHead>
                      <TableHead className={thr}>Baseline</TableHead>
                      <TableHead className={thr}>Current</TableHead>
                      <TableHead className={thr}>Change (positive = better)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {imp.metrics.map((m) => (
                      <TableRow key={m.name} className={rowCls}>
                        <TableCell className={`${td} capitalize`}>{metricLabel(m.name)}</TableCell>
                        <TableCell className={tdr}>{fmtNum(m.baseline)}</TableCell>
                        <TableCell className={tdr}>{fmtNum(m.current)}</TableCell>
                        <TableCell className={tdr}>{fmtPct(m.improvement_pct)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </Section>

        <Section title="Clinician marks">
          {marks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No marks recorded yet.</p>
          ) : (
            <Table className="text-sm">
              <TableHeader>
                <TableRow className={rowCls}>
                  <TableHead className={th}>Date</TableHead>
                  <TableHead className={thr}>Range</TableHead>
                  <TableHead className={thr}>Smoothness</TableHead>
                  <TableHead className={thr}>Control</TableHead>
                  <TableHead className={thr}>Adherence</TableHead>
                  <TableHead className={thr}>Overall</TableHead>
                  <TableHead className={th}>Scale</TableHead>
                  <TableHead className={th}>Comment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {marks.map((a) => (
                  <TableRow key={a.id} className={rowCls}>
                    <TableCell className={td}>{fmtDate(a.assessed_on, yr)}</TableCell>
                    <TableCell className={tdr}>{a.rubric.range}</TableCell>
                    <TableCell className={tdr}>{a.rubric.smoothness}</TableCell>
                    <TableCell className={tdr}>{a.rubric.control}</TableCell>
                    <TableCell className={tdr}>{a.rubric.adherence}</TableCell>
                    <TableCell className={tdr}>{a.rubric.overall}</TableCell>
                    <TableCell className={td}>{a.scale_name ? `${a.scale_name}: ${a.scale_score ?? "n/a"}` : "none"}</TableCell>
                    <TableCell className={`${td} max-w-64 whitespace-normal py-1`}>{a.comment ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>

        <Section title="Plan">
          {d.plan ? (
            <p>
              Levels allowed: {[...d.plan.levels_allowed].sort((a, b) => a - b).join(", ")}. {d.plan.reps_per_level} reps per level, {d.plan.sessions_per_week} sessions per week, adaptive difficulty{" "}
              {d.plan.adapt_on ? "on" : "off"}.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No plan set.</p>
          )}
        </Section>

        <footer className="border-t border-border pt-4 text-[0.8125rem] text-muted-foreground print:text-neutral-600">
          Descriptive metrics. Not a clinical diagnosis; no clinical effectiveness is claimed.
        </footer>
      </article>
    </div>
  );
}
