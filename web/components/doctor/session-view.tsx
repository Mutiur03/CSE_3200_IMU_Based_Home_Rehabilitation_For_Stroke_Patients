"use client";
import Link from "next/link";
import { Fragment } from "react";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDateTime, fmtNum } from "./format";
import { usePatient, useSession, useTrace } from "./queries";
import { Empty, ErrorBox, Loading } from "./states";
import { TracePlot } from "./trace-plot";

const th = "h-11 px-3 text-right text-[0.8125rem] font-medium text-muted-foreground";
const td = "h-11 px-3 text-right tnum";

function Trace({ id }: { id: number }) {
  const t = useTrace(id);
  if (t.isPending) return <Loading rows={2} />;
  if (t.isError) return <ErrorBox error={t.error} retry={() => t.refetch()} />;
  if (t.data === null) return <Empty>No signal trace is stored for this session (404). Only rep summaries are available.</Empty>;
  if (t.data.points.length === 0) return <Empty>The stored trace has no samples.</Empty>;
  return <TracePlot trace={t.data} />;
}

function PatientName({ id }: { id: number }) {
  const p = usePatient(id);
  return <>{p.data?.name ?? "Session"}</>;
}

function duration(a: string, b?: string | null) {
  if (!b) return null;
  const s = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function SessionView({ id }: { id: number }) {
  const s = useSession(id);
  if (s.isPending) return <Loading rows={5} />;
  if (s.isError) return <ErrorBox error={s.error} retry={() => s.refetch()} />;
  const d = s.data;
  const len = duration(d.started_at, d.ended_at);

  // Group consecutive reps by level and task for the table subheadings.
  const groups: { key: string; level: number; task: string; reps: typeof d.reps }[] = [];
  for (const r of d.reps) {
    const key = `${r.level}|${r.task}`;
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.reps.push(r);
    else groups.push({ key, level: r.level, task: r.task, reps: [r] });
  }

  return (
    <div>
      <Link href={`/doctor/patients/${d.patient_id}`} className="mb-6 inline-block rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        Back to patient
      </Link>
      <PageHeader
        title={<PatientName id={d.patient_id} />}
        description={`Session on ${fmtDateTime(d.started_at)}, device ${d.device_id}.`}
        className="mb-0"
      />

      <dl className="grid grid-cols-2 gap-x-8 gap-y-6 border-b border-border py-8 md:grid-cols-5">
        <Stat label="Reps" value={d.n_reps ?? 0} />
        <Stat label="Mean movement quality score" value={fmtNum(d.mean_quality)} />
        <Stat label="Duration (min:sec)" value={len ?? "n/a"} />
        <Stat label="Dropped packets" value={d.dropped_packets ?? "n/a"} />
        <Stat label="Sample rate" value={fmtNum(d.sample_rate_hz)} unit="Hz" />
      </dl>

      <section className="border-b border-border py-8" aria-labelledby="replay">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="replay" className="text-xl">Signal replay</h2>
          <p className="text-[0.8125rem] text-muted-foreground">Pitch and roll in degrees. Scroll or drag the slider to zoom.</p>
        </div>
        <Trace id={id} />
      </section>

      <section className="py-8" aria-labelledby="reps">
        <h2 id="reps" className="mb-4 text-xl">Reps</h2>
        {d.reps.length === 0 ? (
          <Empty>No reps recorded in this session.</Empty>
        ) : (
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={th}>Rep</TableHead>
                <TableHead className={th}>Duration (s)</TableHead>
                <TableHead className={th}>Pitch range (deg)</TableHead>
                <TableHead className={th}>Roll range (deg)</TableHead>
                <TableHead className={th}>Peak speed (deg/s)</TableHead>
                <TableHead className={th}>Speed peaks</TableHead>
                <TableHead className={th}>Quality</TableHead>
                <TableHead className={th}>Timing</TableHead>
                <TableHead className={th}>Smoothness</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g, gi) => (
                <Fragment key={`${g.key}-${gi}`}>
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={9} className="h-11 px-3 pt-4 align-bottom text-[0.8125rem] font-medium">
                      Level {g.level}
                      <span className="font-normal text-muted-foreground">, {g.task}</span>
                    </TableCell>
                  </TableRow>
                  {g.reps.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className={td}>{r.rep}</TableCell>
                      <TableCell className={td}>{fmtNum(r.duration_s, 2)}</TableCell>
                      <TableCell className={td}>{fmtNum(r.pitch_range_deg)}</TableCell>
                      <TableCell className={td}>{fmtNum(r.roll_range_deg)}</TableCell>
                      <TableCell className={td}>{fmtNum(r.peak_speed_dps, 0)}</TableCell>
                      <TableCell className={td}>{r.speed_peaks ?? "n/a"}</TableCell>
                      <TableCell className={r.quality == null ? `${td} text-muted-foreground` : td}>{r.quality == null ? "n/a (first rep)" : fmtNum(r.quality)}</TableCell>
                      <TableCell className={td}>{fmtNum(r.timing_score)}</TableCell>
                      <TableCell className={td}>{fmtNum(r.smoothness_score)}</TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
