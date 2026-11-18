"use client";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AssessmentTable } from "./assessment-table";
import { fmtDate, fmtDateTime, fmtNum } from "./format";
import { ImprovementCard } from "./improvement";
import { usePatient, useProgress } from "./queries";
import { ErrorBox, Loading } from "./states";
import { TrendCharts } from "./trend-charts";

export function PatientReport({ id }: { id: number }) {
  const p = usePatient(id);
  const g = useProgress(id);
  if (p.isPending || g.isPending) return <Loading rows={5} />;
  if (p.isError) return <ErrorBox error={p.error} retry={() => p.refetch()} />;
  if (g.isError) return <ErrorBox error={g.error} retry={() => g.refetch()} />;
  const d = p.data;
  const sessions = [...g.data.sessions].sort((a, b) => a.started_at.localeCompare(b.started_at));
  const period = sessions.length ? `${fmtDate(sessions[0].started_at)} to ${fmtDate(sessions[sessions.length - 1].started_at)}` : "no sessions";

  return (
    <article className="space-y-6 print:space-y-4 print:text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/doctor/patients/${id}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
          Back to patient
        </Link>
        <div className="flex gap-2">
          <a href={`/api/patients/${id}/reps.csv`} download className={buttonVariants({ variant: "outline" })}>
            Download CSV
          </a>
          <Button onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Rehabilitation progress report</h1>
        <p className="text-lg">{d.name}</p>
        <p className="text-sm text-muted-foreground">
          {d.email} - Device: {d.device_id ?? "none"} - Affected side: {d.affected_side ?? "not recorded"} - Onset: {d.onset_date ? fmtDate(d.onset_date) : "not recorded"}
        </p>
        <p className="text-sm text-muted-foreground">
          Period: {period} - {d.sessions_total} sessions - mean movement quality score {fmtNum(d.mean_quality)}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Sessions</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions recorded.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Reps</TableHead>
                <TableHead className="text-right">Mean quality</TableHead>
                <TableHead className="text-right">Roll range</TableHead>
                <TableHead className="text-right">Pitch range</TableHead>
                <TableHead className="text-right">Duration (s)</TableHead>
                <TableHead className="text-right">Dropped packets</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{fmtDateTime(s.started_at)}</TableCell>
                  <TableCell className="text-right">{s.n_reps ?? "n/a"}</TableCell>
                  <TableCell className="text-right">{fmtNum(s.mean_quality)}</TableCell>
                  <TableCell className="text-right">{fmtNum(s.mean_roll_range_deg)}</TableCell>
                  <TableCell className="text-right">{fmtNum(s.mean_pitch_range_deg)}</TableCell>
                  <TableCell className="text-right">{fmtNum(s.mean_duration_s)}</TableCell>
                  <TableCell className="text-right">{s.dropped_packets ?? "n/a"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Trends</h2>
        <TrendCharts sessions={g.data.sessions} assessments={g.data.assessments} />
      </section>

      <ImprovementCard imp={g.data.improvement} />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Clinician marks</h2>
        <AssessmentTable items={g.data.assessments} />
      </section>

      <section className="space-y-1 break-inside-avoid">
        <h2 className="text-lg font-semibold">Plan</h2>
        {d.plan ? (
          <p className="text-sm">
            Levels allowed: {[...d.plan.levels_allowed].sort((a, b) => a - b).join(", ")} - {d.plan.reps_per_level} reps per level - {d.plan.sessions_per_week} sessions per week - adaptive difficulty {d.plan.adapt_on ? "on" : "off"}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No plan set.</p>
        )}
      </section>

      <footer className="border-t pt-3 text-xs text-muted-foreground">
        Descriptive metrics. Not a clinical diagnosis; no clinical effectiveness is claimed.
      </footer>
    </article>
  );
}
