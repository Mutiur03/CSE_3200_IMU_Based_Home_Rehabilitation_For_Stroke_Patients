"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ErrorNote } from "@/components/app-shell";
import { num } from "@/components/patient/util";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, unwrap } from "@/lib/api";

export default function PlayPage() {
  const qc = useQueryClient();
  const end = useMutation({
    mutationFn: () => unwrap(api.POST("/api/sessions/end")),
    onSuccess: () => qc.invalidateQueries(),
  });

  if (end.data) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader><CardTitle className="text-xl">Session finished</CardTitle></CardHeader>
        <CardContent className="grid gap-4 text-base">
          <p>Repetitions: <strong>{end.data.n_reps ?? 0}</strong></p>
          <p>Mean movement quality score: <strong>{num(end.data.mean_quality)}</strong></p>
          <Link href="/patient" className={buttonVariants({ size: "lg", className: "h-14 text-lg" })}>Back to home</Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" variant="destructive" className="h-12 px-5 text-base" onClick={() => end.mutate()} disabled={end.isPending}>
          {end.isPending ? "Ending..." : "End session"}
        </Button>
        <p className="flex-1 text-base text-muted-foreground">Wear the wristband, rest your forearm on the table.</p>
      </div>
      {end.error && <ErrorNote error={end.error} />}
      <iframe title="Rehabilitation game" src="/play/" allow="fullscreen; autoplay" className="min-h-[60dvh] w-full flex-1 rounded-lg border bg-muted" />
      <p className="text-sm text-muted-foreground">If this area stays blank, the game has not been installed on this server yet. Tell your doctor or the clinic.</p>
    </div>
  );
}
