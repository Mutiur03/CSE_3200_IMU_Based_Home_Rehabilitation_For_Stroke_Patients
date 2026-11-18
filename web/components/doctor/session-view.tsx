"use client";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDateTime, fmtNum } from "./format";
import { useSession, useTrace } from "./queries";
import { Empty, ErrorBox, Loading } from "./states";
import { TracePlot } from "./trace-plot";

function Trace({ id }: { id: number }) {
  const t = useTrace(id);
  if (t.isPending) return <Loading rows={2} />;
  if (t.isError) return <ErrorBox error={t.error} retry={() => t.refetch()} />;
  if (t.data === null) return <Empty>No signal trace is stored for this session (404). Only rep summaries are available.</Empty>;
  if (t.data.points.length === 0) return <Empty>The stored trace has no samples.</Empty>;
  return <TracePlot trace={t.data} />;
}

export function SessionView({ id }: { id: number }) {
  const s = useSession(id);
  if (s.isPending) return <Loading rows={5} />;
  if (s.isError) return <ErrorBox error={s.error} retry={() => s.refetch()} />;
  const d = s.data;
  return (
    <div className="space-y-6">
      <Link href={`/doctor/patients/${d.patient_id}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
        Back to patient
      </Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Session {fmtDateTime(d.started_at)}</h1>
        <p className="text-sm text-muted-foreground">
          Device {d.device_id} - {d.n_reps ?? 0} reps - mean movement quality score {fmtNum(d.mean_quality)} - dropped packets {d.dropped_packets ?? "n/a"} - sample rate {fmtNum(d.sample_rate_hz)} Hz
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Signal replay</h2>
        <Trace id={id} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Reps</h2>
        {d.reps.length === 0 ? (
          <Empty>No reps recorded in this session.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">Level</TableHead>
                <TableHead>Task</TableHead>
                <TableHead className="text-right">Rep</TableHead>
                <TableHead className="text-right">Duration (s)</TableHead>
                <TableHead className="text-right">Pitch range (deg)</TableHead>
                <TableHead className="text-right">Roll range (deg)</TableHead>
                <TableHead className="text-right">Peak speed (deg/s)</TableHead>
                <TableHead className="text-right">Speed peaks</TableHead>
                <TableHead className="text-right">Quality</TableHead>
                <TableHead className="text-right">Timing</TableHead>
                <TableHead className="text-right">Smoothness</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.reps.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-right">{r.level}</TableCell>
                  <TableCell>{r.task}</TableCell>
                  <TableCell className="text-right">{r.rep}</TableCell>
                  <TableCell className="text-right">{fmtNum(r.duration_s, 2)}</TableCell>
                  <TableCell className="text-right">{fmtNum(r.pitch_range_deg)}</TableCell>
                  <TableCell className="text-right">{fmtNum(r.roll_range_deg)}</TableCell>
                  <TableCell className="text-right">{fmtNum(r.peak_speed_dps, 0)}</TableCell>
                  <TableCell className="text-right">{r.speed_peaks ?? "n/a"}</TableCell>
                  <TableCell className="text-right">{r.quality == null ? "n/a (first rep)" : fmtNum(r.quality)}</TableCell>
                  <TableCell className="text-right">{fmtNum(r.timing_score)}</TableCell>
                  <TableCell className="text-right">{fmtNum(r.smoothness_score)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
