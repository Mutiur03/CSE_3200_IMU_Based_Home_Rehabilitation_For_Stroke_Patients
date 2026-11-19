"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ErrorNote } from "@/components/app-shell";
import { num } from "@/components/patient/util";
import { Button, buttonVariants } from "@/components/ui/button";
import { api, unwrap, type Schemas } from "@/lib/api";

export function PlayClient({ src, available }: { src: string; available: boolean }) {
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<Schemas["SessionOut"] | null>(null);

  async function end() {
    setPending(true);
    setError(null);
    try {
      setDone(await unwrap(api.POST("/api/sessions/end")));
      router.refresh();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-xl px-5 py-14 md:py-20">
        <h1 className="text-[2.5rem] leading-tight">Session finished</h1>
        <dl className="mt-10 grid grid-cols-2 gap-8 border-t border-border pt-8">
          <div>
            <dt className="text-base text-muted-foreground">Repetitions</dt>
            <dd className="font-display tnum mt-1 text-[3rem] leading-none">{done.n_reps ?? 0}</dd>
          </div>
          <div>
            <dt className="text-base text-muted-foreground">Mean movement quality score</dt>
            <dd className="font-display tnum mt-1 text-[3rem] leading-none">{num(done.mean_quality)}</dd>
          </div>
        </dl>
        <Link href="/patient" className={buttonVariants({ size: "xl", className: "mt-12 text-lg" })}>Back to home</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-background px-5 py-2">
        <Button size="lg" variant="destructive" className="h-12 px-6 text-base" onClick={end} disabled={pending}>
          {pending ? "Ending..." : "End session"}
        </Button>
        <Button size="lg" variant="outline" className="h-12 px-6 text-base" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
          Full screen
        </Button>
        <p className="hidden flex-1 text-base text-muted-foreground sm:block">Wear the wristband and rest your forearm on the table.</p>
      </div>
      {error != null && <div className="px-5 py-2"><ErrorNote error={error} /></div>}
      {available ? (
        <iframe ref={frame} title="Rehabilitation game" src={src} allow="fullscreen; autoplay" className="min-h-0 w-full flex-1 bg-muted" />
      ) : (
        <div role="status" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-14">
          <h1 className="text-[1.75rem] leading-tight">The game is not available right now</h1>
          <p className="mt-3 text-muted-foreground">The game is not available right now. Ask your clinic to check the setup.</p>
        </div>
      )}
    </div>
  );
}
