import Link from "next/link";
import { StartButton } from "@/components/patient/start-button";
import { fmtDate, num, weekStart } from "@/components/patient/util";
import { PageHeader } from "@/components/page-header";
import { load, loadOptional, requireRole } from "@/lib/server-api";

export default async function PatientHome() {
  const me = await requireRole("patient");
  const [plan, sessions, current] = await Promise.all([
    loadOptional((api) => api.GET("/api/plan")),
    load((api) => api.GET("/api/patients/{patient_id}/sessions", { params: { path: { patient_id: me.id } } })),
    load((api) => api.GET("/api/sessions/current")),
  ]);

  const ws = weekStart();
  const done = sessions.filter((s) => s.ended_at && new Date(s.started_at) >= ws).length;
  const latest = sessions.filter((s) => s.ended_at).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  const open = !!current;

  return (
    <div>
      <PageHeader title={`Hello, ${me.name}`} />

      <section aria-labelledby="today-h" className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center md:gap-16">
        <div>
          <h2 id="today-h" className="text-[1.75rem] leading-tight">Today&apos;s session</h2>
          {plan ? (
            <p className="mt-3 max-w-md">
              Play levels {plan.levels_allowed.join(", ")}, with {plan.reps_per_level} repetitions on each level. Your plan asks for {plan.sessions_per_week} sessions a week.
            </p>
          ) : (
            <p className="mt-3 max-w-md text-muted-foreground">Your doctor has not set a plan yet. Ask them in Messages.</p>
          )}
          <p className="mt-3 max-w-md text-muted-foreground">Wear the wristband and rest your forearm on the table before you start.</p>
        </div>
        <StartButton open={open} />
      </section>

      <dl className="mt-14 grid gap-x-16 gap-y-8 border-t border-border pt-10 sm:grid-cols-2">
        <div>
          <dt className="text-base text-muted-foreground">This week</dt>
          <dd className="mt-1">
            <span className="font-display tnum text-[2.5rem] leading-none">{done}{plan ? ` of ${plan.sessions_per_week}` : ""}</span>
            <span className="ml-2 text-muted-foreground">sessions done</span>
            {plan && plan.sessions_per_week > 0 && (
              <div
                role="progressbar"
                aria-label="Sessions done this week"
                aria-valuemin={0}
                aria-valuemax={plan.sessions_per_week}
                aria-valuenow={Math.min(done, plan.sessions_per_week)}
                className="mt-4 h-2 w-full max-w-xs overflow-hidden rounded-full bg-border"
              >
                <div className="h-full bg-primary" style={{ width: `${(Math.min(done, plan.sessions_per_week) / plan.sessions_per_week) * 100}%` }} />
              </div>
            )}
            <span className="mt-2 block text-base text-muted-foreground">The week starts on Monday.</span>
          </dd>
        </div>
        <div>
          <dt className="text-base text-muted-foreground">Latest session</dt>
          <dd className="mt-1">
            {latest ? (
              <>
                <span className="block">{fmtDate(latest.started_at)}</span>
                <span className="mt-1 block">
                  <strong className="font-medium">{latest.n_reps ?? 0}</strong> repetitions, movement quality score <strong className="font-medium">{num(latest.mean_quality)}</strong>
                </span>
                <Link href="/patient/progress" className="mt-3 inline-flex min-h-14 items-center text-primary underline underline-offset-4">See my progress</Link>
              </>
            ) : (
              <span className="text-muted-foreground">No finished sessions yet. Start your first one above.</span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
