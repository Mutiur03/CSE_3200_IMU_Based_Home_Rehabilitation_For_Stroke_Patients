import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { ClinicalSummary } from "./clinical-summary";
import { fmtDate, fmtDateTime } from "./format";
import type { Schemas } from "@/lib/api";
import { PrintButton } from "./print-button";
import { TrendCharts } from "./trend-charts";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-6 print:break-inside-avoid-page">
      <h2 className="mb-4 text-xl">{title}</h2>
      {children}
    </section>
  );
}

const KIND = { movement: "Movement", force: "Grip force", mixed: "Movement and grip", none: "No exercises" } as const;

/** Doctor's performance report: plain language first, graphs second, how-it-works last. Same content as the Word file. */
export function PatientReport({
  id,
  d,
  progress: g,
  report: r,
  methods,
}: {
  id: number;
  d: Schemas["PatientDetail"];
  progress: Schemas["Progress"];
  report: Schemas["ClinicalReport"];
  methods: Schemas["MethodItem"][];
}) {
  const plan = d.plan;
  const played = r.sessions.filter((s) => s.kind !== "none");
  const empty = r.sessions.length - played.length;
  const facts: [string, string][] = [
    ["Period", r.period],
    ["Report date", fmtDate(r.generated_at, true)],
    ["Affected side", d.affected_side ? d.affected_side[0].toUpperCase() + d.affected_side.slice(1) : "Not recorded"],
    ["Onset", d.onset_date ? fmtDate(d.onset_date, true) : "Not recorded"],
    [
      "Plan",
      plan
        ? `Levels ${[...plan.levels_allowed].sort((a, b) => a - b).join(", ")}; ${plan.reps_per_level} repetitions per level; ${plan.sessions_per_week} sessions a week`
        : "No plan set",
    ],
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/doctor/patients/${id}`}
          className="-ml-1 inline-flex min-h-11 items-center rounded-sm px-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Back to patient
        </Link>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/patients/${id}/report.docx`} download className={buttonVariants()}>
            Download Word report
          </a>
          <PrintButton />
          <a href={`/api/patients/${id}/reps.csv`} download className={buttonVariants({ variant: "ghost" })} title="Per-repetition measurements for research">
            Raw data (CSV)
          </a>
        </div>
      </div>

      <article className="space-y-10 rounded-xl border border-border bg-card px-6 py-8 text-[0.9375rem] sm:px-12 sm:py-12 print:space-y-6 print:rounded-none print:border-0 print:bg-white print:p-0 print:text-[10pt] print:text-black">
        <header>
          <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
            <Wordmark />
            <p className="text-[0.8125rem] text-muted-foreground print:text-neutral-600">Rehabilitation performance report</p>
          </div>
          <h1 className="mt-8 text-[2.25rem] leading-[1.1] sm:text-[2.75rem] print:text-[26pt]">{d.name}</h1>
          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
            {facts.map(([k, v]) => (
              <div key={k} className={k === "Plan" ? "col-span-2" : ""}>
                <dt className="text-[0.8125rem] text-muted-foreground print:text-neutral-600">{k}</dt>
                <dd className="mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>
        </header>

        <ClinicalSummary r={r} />

        <Section title="Graphs">
          <TrendCharts sessions={g.sessions} assessments={g.assessments} />
        </Section>

        <Section title="Session log">
          {played.length === 0 ? (
            <p className="text-muted-foreground">No sessions with completed exercises yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {played.map((s) => (
                <li key={s.session_id} className="grid gap-x-6 py-2.5 sm:grid-cols-[13rem_10rem_7rem_1fr] print:break-inside-avoid">
                  <span>{fmtDateTime(s.started_at)}</span>
                  <span className="text-muted-foreground">{KIND[s.kind]}</span>
                  <span className="tnum text-muted-foreground">{s.reps} repetitions</span>
                  <span>{s.result}</span>
                </li>
              ))}
            </ul>
          )}
          {empty > 0 && (
            <p className="mt-3 text-[0.8125rem] text-muted-foreground">
              {empty} session{empty === 1 ? "" : "s"} with no completed exercises {empty === 1 ? "is" : "are"} not listed (see the Sessions tab).
            </p>
          )}
        </Section>

        <Section title="How these measures work">
          <dl className="grid gap-4">
            {methods.map((m) => (
              <div key={m.title} className="break-inside-avoid">
                <dt className="font-medium">{m.title}</dt>
                <dd className="mt-0.5 text-muted-foreground print:text-neutral-700">{m.text}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <footer className="border-t border-border pt-4 text-[0.8125rem] text-muted-foreground print:text-neutral-600">{r.caveat}</footer>
      </article>
    </div>
  );
}
