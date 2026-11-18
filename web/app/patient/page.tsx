"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErrorNote, Loading } from "@/components/app-shell";
import { fmtDate, num, useSessions, weekStart } from "@/components/patient/util";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { api, unwrap } from "@/lib/api";
import { useMe } from "@/lib/auth";

export default function PatientHome() {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe().data;
  const id = me?.id ?? 0;
  const plan = useQuery({
    queryKey: ["plan"],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/plan");
      if (response.status === 404) return null;
      if (!data) throw new Error(`HTTP ${response.status}`);
      return data;
    },
  });
  const sessions = useSessions(id);
  const current = useQuery({ queryKey: ["current"], queryFn: () => unwrap(api.GET("/api/sessions/current")) });
  const start = useMutation({
    mutationFn: () => unwrap(api.POST("/api/sessions/start")),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["current"] });
      router.push("/patient/play");
    },
  });

  const err = plan.error ?? sessions.error ?? current.error;
  if (err) return <ErrorNote error={err} retry={() => { plan.refetch(); sessions.refetch(); current.refetch(); }} />;
  if (plan.data === undefined || !sessions.data || current.data === undefined) return <Loading />;

  const ws = weekStart();
  const done = sessions.data.filter((s) => s.ended_at && new Date(s.started_at) >= ws).length;
  const latest = sessions.data.filter((s) => s.ended_at).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  const open = !!current.data;

  return (
    <div>
      <PageHeader title={`Hello, ${me?.name ?? ""}`} />

      <section aria-labelledby="today-h" className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center md:gap-16">
        <div>
          <h2 id="today-h" className="text-[1.75rem] leading-tight">Today&apos;s session</h2>
          {plan.data ? (
            <p className="mt-3 max-w-md">
              Play levels {plan.data.levels_allowed.join(", ")}, with {plan.data.reps_per_level} repetitions on each level. Your plan asks for {plan.data.sessions_per_week} sessions a week.
            </p>
          ) : (
            <p className="mt-3 max-w-md text-muted-foreground">Your doctor has not set a plan yet. Ask them in Messages.</p>
          )}
          <p className="mt-3 max-w-md text-muted-foreground">Wear the wristband and rest your forearm on the table before you start.</p>
        </div>
        <div className="grid gap-3">
          <Button size="xl" className="h-16 px-10 text-xl md:min-w-64" onClick={() => (open ? router.push("/patient/play") : start.mutate())} disabled={start.isPending}>
            {open ? "Continue session" : start.isPending ? "Starting..." : "Start session"}
          </Button>
          {start.error && <ErrorNote error={start.error} />}
        </div>
      </section>

      <dl className="mt-14 grid gap-x-16 gap-y-8 border-t border-border pt-10 sm:grid-cols-2">
        <div>
          <dt className="text-base text-muted-foreground">This week</dt>
          <dd className="mt-1">
            <span className="font-display tnum text-[2.5rem] leading-none">{done}{plan.data ? ` of ${plan.data.sessions_per_week}` : ""}</span>
            <span className="ml-2 text-muted-foreground">sessions done</span>
            {plan.data && plan.data.sessions_per_week > 0 && (
              <progress className="mt-4 block h-2 w-full max-w-xs accent-primary" max={plan.data.sessions_per_week} value={Math.min(done, plan.data.sessions_per_week)} aria-label="Sessions done this week" />
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
