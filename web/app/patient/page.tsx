"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErrorNote, Loading } from "@/components/app-shell";
import { fmtDate, num, useSessions, weekStart } from "@/components/patient/util";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Hello, {me?.name}</h1>

      <Card>
        <CardContent className="grid gap-4 pt-4">
          <Button className="h-16 text-xl" size="lg" onClick={() => (open ? router.push("/patient/play") : start.mutate())} disabled={start.isPending}>
            {open ? "Continue session" : start.isPending ? "Starting..." : "Start session"}
          </Button>
          <p className="text-muted-foreground">Wear the wristband and rest your forearm on the table before you start.</p>
          {start.error && <ErrorNote error={start.error} />}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">Today&apos;s plan</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-base">
            {plan.data ? (
              <>
                <p>Levels: <strong>{plan.data.levels_allowed.join(", ")}</strong></p>
                <p>Repetitions per level: <strong>{plan.data.reps_per_level}</strong></p>
                <p>Sessions per week: <strong>{plan.data.sessions_per_week}</strong></p>
              </>
            ) : (
              <p className="text-muted-foreground">Your doctor has not set a plan yet. You can ask them in Messages.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">This week</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-base">
            <p className="text-3xl font-semibold">
              {done}{plan.data ? ` of ${plan.data.sessions_per_week}` : ""} <span className="text-base font-normal text-muted-foreground">sessions done</span>
            </p>
            {plan.data && plan.data.sessions_per_week > 0 && (
              <progress className="h-3 w-full accent-primary" max={plan.data.sessions_per_week} value={Math.min(done, plan.data.sessions_per_week)} aria-label="Sessions done this week" />
            )}
            <p className="text-sm text-muted-foreground">The week starts on Monday.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Latest session</CardTitle></CardHeader>
        <CardContent className="text-base">
          {latest ? (
            <p>
              {fmtDate(latest.started_at)}: <strong>{latest.n_reps ?? 0}</strong> repetitions, movement quality score <strong>{num(latest.mean_quality)}</strong>.{" "}
              <Link href="/patient/progress" className="underline">See my progress</Link>
            </p>
          ) : (
            <p className="text-muted-foreground">No finished sessions yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
