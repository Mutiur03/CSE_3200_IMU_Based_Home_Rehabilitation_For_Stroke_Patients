"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ErrorNote } from "@/components/app-shell";
import { num } from "@/components/patient/util";
import { Button, buttonVariants } from "@/components/ui/button";
import { api, unwrap } from "@/lib/api";

export default function PlayPage() {
  const qc = useQueryClient();
  const end = useMutation({
    mutationFn: () => unwrap(api.POST("/api/sessions/end")),
    onSuccess: () => qc.invalidateQueries(),
  });

  // Lightweight probe so a missing game build shows a calm message, not the iframe's 404 page.
  const game = useQuery({
    queryKey: ["game-available"],
    queryFn: async () => {
      try {
        return (await fetch("/play/", { method: "HEAD" })).ok;
      } catch {
        return false;
      }
    },
    retry: false,
    staleTime: 0,
  });

  if (end.data) {
    return (
      <div className="mx-auto w-full max-w-xl px-5 py-14 md:py-20">
        <h1 className="text-[2.5rem] leading-tight">Session finished</h1>
        <dl className="mt-10 grid grid-cols-2 gap-8 border-t border-border pt-8">
          <div>
            <dt className="text-base text-muted-foreground">Repetitions</dt>
            <dd className="font-display tnum mt-1 text-[3rem] leading-none">{end.data.n_reps ?? 0}</dd>
          </div>
          <div>
            <dt className="text-base text-muted-foreground">Mean movement quality score</dt>
            <dd className="font-display tnum mt-1 text-[3rem] leading-none">{num(end.data.mean_quality)}</dd>
          </div>
        </dl>
        <Link href="/patient" className={buttonVariants({ size: "xl", className: "mt-12 text-lg" })}>Back to home</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-background px-5 py-2">
        <Button size="lg" variant="destructive" className="h-12 px-6 text-base" onClick={() => end.mutate()} disabled={end.isPending}>
          {end.isPending ? "Ending..." : "End session"}
        </Button>
        <p className="hidden flex-1 text-base text-muted-foreground sm:block">Wear the wristband and rest your forearm on the table.</p>
      </div>
      {end.error && <div className="px-5 py-2"><ErrorNote error={end.error} /></div>}
      {game.isPending ? (
        <div className="flex-1 bg-muted" />
      ) : game.data ? (
        <iframe title="Rehabilitation game" src="/play/" allow="fullscreen; autoplay" className="min-h-0 w-full flex-1 bg-muted" />
      ) : (
        <div role="status" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-14">
          <h1 className="text-[1.75rem] leading-tight">The game is not available right now</h1>
          <p className="mt-3 text-muted-foreground">The game is not available right now. Ask your clinic to check the setup.</p>
        </div>
      )}
    </div>
  );
}
