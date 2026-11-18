"use client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AssessmentTable } from "./assessment-table";
import { fmtDate, fmtDateTime, fmtNum } from "./format";
import { ImprovementCard } from "./improvement";
import { MarkingTab } from "./marking-tab";
import { MessagesTab } from "./messages-tab";
import { PlanTab } from "./plan-tab";
import { useAssessments, usePatient, useProgress, useSessions } from "./queries";
import { Empty, ErrorBox, Loading } from "./states";
import { TrendCharts } from "./trend-charts";

function Overview({ id }: { id: number }) {
  const p = useProgress(id);
  if (p.isPending) return <Loading />;
  if (p.isError) return <ErrorBox error={p.error} retry={() => p.refetch()} />;
  return (
    <div className="space-y-6">
      <ImprovementCard imp={p.data.improvement} />
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Per-session trends</h2>
        <TrendCharts sessions={p.data.sessions} assessments={p.data.assessments} />
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Your marks, for comparison with the index</h2>
        <AssessmentTable items={p.data.assessments} />
      </section>
    </div>
  );
}

function Sessions({ id }: { id: number }) {
  const q = useSessions(id);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  if (q.data.length === 0) return <Empty>No sessions recorded yet.</Empty>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Reps</TableHead>
          <TableHead className="text-right">Mean quality</TableHead>
          <TableHead className="text-right">Dropped packets</TableHead>
          <TableHead className="text-right">Sample rate (Hz)</TableHead>
          <TableHead>
            <span className="sr-only">Detail</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...q.data]
          .sort((a, b) => b.started_at.localeCompare(a.started_at))
          .map((s) => (
            <TableRow key={s.id}>
              <TableCell>{fmtDateTime(s.started_at)}</TableCell>
              <TableCell className="text-right">{s.n_reps ?? "n/a"}</TableCell>
              <TableCell className="text-right">{fmtNum(s.mean_quality)}</TableCell>
              <TableCell className="text-right">{s.dropped_packets ?? "n/a"}</TableCell>
              <TableCell className="text-right">{fmtNum(s.sample_rate_hz)}</TableCell>
              <TableCell>
                <Link href={`/doctor/sessions/${s.id}`} className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">
                  Reps and replay<span className="sr-only"> for {fmtDateTime(s.started_at)}</span>
                </Link>
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}

export function PatientView({ id }: { id: number }) {
  const p = usePatient(id);
  useAssessments(id); // warm cache for the marking tab
  if (p.isPending) return <Loading rows={3} />;
  if (p.isError) return <ErrorBox error={p.error} retry={() => p.refetch()} />;
  const d = p.data;
  return (
    <div className="space-y-6">
      <Link href="/doctor" className="text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
        Back to patients
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{d.name}</h1>
          <p className="text-sm text-muted-foreground">
            {d.email} - Device: {d.device_id ?? "none"} - Affected side: {d.affected_side ?? "not recorded"} - Onset: {d.onset_date ? fmtDate(d.onset_date) : "not recorded"}
          </p>
          <p className="text-sm text-muted-foreground">
            {d.sessions_total} sessions - mean movement quality score {fmtNum(d.mean_quality)} - last session {fmtDateTime(d.last_session_at)}
          </p>
          {d.notes && <p className="text-sm">{d.notes}</p>}
          {d.flags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {d.flags.map((f) => (
                <Badge key={f.kind} variant="destructive" className="h-auto whitespace-normal">
                  {f.message}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <Link href={`/doctor/patients/${id}/report`} className={buttonVariants({ variant: "outline" })}>
          Report
        </Link>
      </header>

      <Tabs defaultValue="overview">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="marking">Marking</TabsTrigger>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-4">
          <Overview id={id} />
        </TabsContent>
        <TabsContent value="sessions" className="pt-4">
          <Sessions id={id} />
        </TabsContent>
        <TabsContent value="marking" className="pt-4">
          <MarkingTab id={id} />
        </TabsContent>
        <TabsContent value="plan" className="pt-4">
          <PlanTab key={d.plan?.updated_at ?? "none"} id={id} plan={d.plan} rule={d.alert_rule} />
        </TabsContent>
        <TabsContent value="messages" className="pt-4">
          <MessagesTab id={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
