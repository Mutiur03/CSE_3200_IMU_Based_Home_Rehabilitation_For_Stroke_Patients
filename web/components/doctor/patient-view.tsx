import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AssessmentTable } from "./assessment-table";
import { ClinicalSummary } from "./clinical-summary";
import { ScrollFade } from "./scroll-fade";
import { TD, TH, fmtDate, fmtDateTime } from "./format";
import { MarkingTab } from "./marking-tab";
import { MessagesTab } from "./messages-tab";
import { PlanTab } from "./plan-tab";
import type { Schemas } from "@/lib/api";
import { Empty } from "./states";
import { TrendCharts } from "./trend-charts";

function SectionTitle({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <h2 className="text-[1.5rem] leading-tight">{children}</h2>
      {note && <p className="text-[0.8125rem] text-muted-foreground">{note}</p>}
    </div>
  );
}

const HOW = (
  <Link href="/doctor/methods" className="underline underline-offset-4 hover:text-foreground">
    How these are measured
  </Link>
);

function Overview({ progress, report }: { progress: Schemas["Progress"]; report: Schemas["ClinicalReport"] }) {
  return (
    <div className="space-y-14">
      <ClinicalSummary r={report} compact />
      <section>
        <SectionTitle note={HOW}>Session by session</SectionTitle>
        <TrendCharts sessions={progress.sessions} assessments={progress.assessments} />
      </section>
      <section>
        <SectionTitle>Your marks</SectionTitle>
        <AssessmentTable items={progress.assessments} />
      </section>
    </div>
  );
}

const KIND = { movement: "Movement", force: "Grip force", mixed: "Movement and grip", none: "No exercises" } as const;
const RESULT_TONE = (r: string) => (r.startsWith("High") ? "moss" : r.startsWith("Low") ? "amber" : r.startsWith("No completed") ? "neutral" : "brass");

function Sessions({ lines }: { lines: Schemas["SessionLine"][] }) {
  if (lines.length === 0) return <Empty>No sessions recorded yet. They appear here once the patient finishes a game session.</Empty>;
  return (
    <ScrollFade>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={TH}>Date</TableHead>
            <TableHead className={TH}>Exercise</TableHead>
            <TableHead className={`${TH} text-right`}>Repetitions</TableHead>
            <TableHead className={TH}>Result</TableHead>
            <TableHead className={TH}>
              <span className="sr-only">Detail</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((s) => {
            return (
              <TableRow key={s.session_id}>
                <TableCell className={TD}>{fmtDateTime(s.started_at)}</TableCell>
                <TableCell className={TD}>{KIND[s.kind]}</TableCell>
                <TableCell className={`${TD} text-right`}>{s.reps}</TableCell>
                <TableCell className={TD}>
                  <StatusPill tone={RESULT_TONE(s.result)}>{s.result}</StatusPill>
                </TableCell>
                <TableCell className={TD}>
                  {s.kind !== "none" && (
                    <Link href={`/doctor/sessions/${s.session_id}`} className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">
                      Details
                      <span className="sr-only"> for {fmtDateTime(s.started_at)}</span>
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ScrollFade>
  );
}

export function PatientView({
  id,
  d,
  progress,
  report,
  assessments,
  messages,
}: {
  id: number;
  d: Schemas["PatientDetail"];
  progress: Schemas["Progress"];
  report: Schemas["ClinicalReport"];
  assessments: Schemas["AssessmentOut"][];
  messages: Schemas["MessageOut"][];
}) {
  const meta: [string, string][] = [
    ["Affected side", d.affected_side ? d.affected_side[0].toUpperCase() + d.affected_side.slice(1) : "Not recorded"],
    ["Onset", d.onset_date ? fmtDate(d.onset_date, true) : "Not recorded"],
    ["Sessions", String(d.sessions_total)],
    ["Last session", fmtDateTime(d.last_session_at)],
    ["Device", d.device_id ?? "None"],
    ["Email", d.email],
  ];
  return (
    <div>
      <Link
        href="/doctor"
        className="-ml-1 mb-4 inline-flex min-h-11 items-center rounded px-1 text-sm text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        Back to patients
      </Link>
      <PageHeader
        title={d.name}
        className="mb-6"
        actions={
          <>
            <Link href={`/doctor/patients/${id}/report`} className={buttonVariants({ variant: "outline", size: "lg" })}>
              Open report
            </Link>
            <a href={`/api/patients/${id}/report.docx`} download className={buttonVariants({ size: "lg" })}>
              Download Word report
            </a>
          </>
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
      <dl className="mb-10 grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
        {meta.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[0.8125rem] text-muted-foreground">{k}</dt>
            <dd className="tnum mt-0.5 break-words">{v}</dd>
          </div>
        ))}
      </dl>

      <Tabs defaultValue="overview">
        <ScrollFade>
          <TabsList variant="line" className="mb-8 h-11 w-full justify-start gap-6 overflow-x-auto overflow-y-hidden border-b border-border p-0">
            {["overview", "sessions", "marking", "plan", "messages"].map((t) => (
              <TabsTrigger key={t} value={t} className="h-11 flex-none px-0.5 text-[0.95rem] capitalize after:bottom-[-1px] after:bg-primary">
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </ScrollFade>
        <TabsContent value="overview">
          <Overview progress={progress} report={report} />
        </TabsContent>
        <TabsContent value="sessions">
          <Sessions lines={report.sessions} />
        </TabsContent>
        <TabsContent value="marking">
          <MarkingTab id={id} assessments={assessments} />
        </TabsContent>
        <TabsContent value="plan">
          <PlanTab key={d.plan?.updated_at ?? "none"} id={id} plan={d.plan} rule={d.alert_rule} />
        </TabsContent>
        <TabsContent value="messages">
          <MessagesTab id={id} messages={messages} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
