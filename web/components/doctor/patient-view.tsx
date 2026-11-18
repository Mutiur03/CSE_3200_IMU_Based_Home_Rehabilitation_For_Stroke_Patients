"use client";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AssessmentTable } from "./assessment-table";
import { TD, TH, fmtDate, fmtDateTime, fmtNum } from "./format";
import { ImprovementCard } from "./improvement";
import { MarkingTab } from "./marking-tab";
import { MessagesTab } from "./messages-tab";
import { PlanTab } from "./plan-tab";
import { useAssessments, usePatient, useProgress, useSessions } from "./queries";
import { Empty, ErrorBox, Loading } from "./states";
import { TrendCharts } from "./trend-charts";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-[1.5rem] leading-tight">{children}</h2>;
}

function Overview({ id }: { id: number }) {
  const p = useProgress(id);
  if (p.isPending) return <Loading />;
  if (p.isError) return <ErrorBox error={p.error} retry={() => p.refetch()} />;
  return (
    <div className="space-y-14">
      <ImprovementCard imp={p.data.improvement} />
      <section>
        <SectionTitle>Per-session trends</SectionTitle>
        <TrendCharts sessions={p.data.sessions} assessments={p.data.assessments} />
      </section>
      <section>
        <SectionTitle>Your marks, for comparison with the index</SectionTitle>
        <AssessmentTable items={p.data.assessments} />
      </section>
    </div>
  );
}

function Sessions({ id }: { id: number }) {
  const q = useSessions(id);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  if (q.data.length === 0) return <Empty>No sessions recorded yet. They appear here once the patient finishes a game session.</Empty>;
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={TH}>Date</TableHead>
          <TableHead className={`${TH} text-right`}>Reps</TableHead>
          <TableHead className={`${TH} text-right`}>Mean quality</TableHead>
          <TableHead className={`${TH} text-right`}>Dropped packets</TableHead>
          <TableHead className={`${TH} text-right`}>Sample rate (Hz)</TableHead>
          <TableHead className={TH}>
            <span className="sr-only">Detail</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...q.data]
          .sort((a, b) => b.started_at.localeCompare(a.started_at))
          .map((s) => (
            <TableRow key={s.id}>
              <TableCell className={TD}>{fmtDateTime(s.started_at)}</TableCell>
              <TableCell className={`${TD} text-right`}>{s.n_reps ?? "n/a"}</TableCell>
              <TableCell className={`${TD} text-right`}>{fmtNum(s.mean_quality)}</TableCell>
              <TableCell className={`${TD} text-right`}>{s.dropped_packets ?? "n/a"}</TableCell>
              <TableCell className={`${TD} text-right`}>{fmtNum(s.sample_rate_hz)}</TableCell>
              <TableCell className={TD}>
                <Link href={`/doctor/sessions/${s.id}`} className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">
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
  const meta: [string, string][] = [
    ["Email", d.email],
    ["Device", d.device_id ?? "None"],
    ["Affected side", d.affected_side ?? "Not recorded"],
    ["Onset", d.onset_date ? fmtDate(d.onset_date) : "Not recorded"],
    ["Sessions", String(d.sessions_total)],
    ["Mean movement quality score", fmtNum(d.mean_quality)],
    ["Last session", fmtDateTime(d.last_session_at)],
  ];
  return (
    <div>
      <Link href="/doctor" className="-ml-1 mb-4 inline-flex min-h-11 items-center rounded px-1 text-sm text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">
        Back to patients
      </Link>
      <PageHeader
        title={d.name}
        className="mb-6"
        actions={
          <Link href={`/doctor/patients/${id}/report`} className={buttonVariants({ variant: "outline", size: "lg" })}>
            Open report
          </Link>
        }
        description={
          d.notes || d.flags.length > 0 ? (
            <>
              {d.notes && <span className="block text-foreground">{d.notes}</span>}
              {d.flags.length > 0 && (
                <span className="mt-3 flex flex-wrap gap-1.5">
                  {d.flags.map((f) => (
                    <StatusPill key={f.kind} tone="madder">
                      {f.message}
                    </StatusPill>
                  ))}
                </span>
              )}
            </>
          ) : undefined
        }
      />
      <dl className="mb-10 grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
        {meta.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[0.8125rem] text-muted-foreground">{k}</dt>
            <dd className="tnum mt-0.5 break-words">{v}</dd>
          </div>
        ))}
      </dl>

      <Tabs defaultValue="overview">
        <TabsList variant="line" className="mb-8 h-11 w-full justify-start gap-6 overflow-x-auto border-b border-border p-0">
          {["overview", "sessions", "marking", "plan", "messages"].map((t) => (
            <TabsTrigger key={t} value={t} className="h-11 flex-none px-0.5 text-[0.95rem] capitalize after:bottom-[-1px] after:bg-primary">
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <Overview id={id} />
        </TabsContent>
        <TabsContent value="sessions">
          <Sessions id={id} />
        </TabsContent>
        <TabsContent value="marking">
          <MarkingTab id={id} />
        </TabsContent>
        <TabsContent value="plan">
          <PlanTab key={d.plan?.updated_at ?? "none"} id={id} plan={d.plan} rule={d.alert_rule} />
        </TabsContent>
        <TabsContent value="messages">
          <MessagesTab id={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
