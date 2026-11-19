"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ErrorNote } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { api, unwrap } from "@/lib/api";

export function StartButton({ open }: { open: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const isPending = busy || pending;

  async function onClick() {
    // Must run inside the click (browsers only allow fullscreen from a user gesture). The page stays fullscreen across the
    // client-side navigation to /patient/play, so the game opens full screen.
    document.documentElement.requestFullscreen?.().catch(() => {});
    if (open) return router.push("/patient/play");
    setBusy(true);
    setError(null);
    try {
      await unwrap(api.POST("/api/sessions/start"));
      startTransition(() => router.push("/patient/play"));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <Button size="xl" className="h-16 px-10 text-xl md:min-w-64" onClick={onClick} disabled={isPending}>
        {open ? "Continue session" : isPending ? "Starting..." : "Start session"}
      </Button>
      {error != null && <ErrorNote error={error} />}
    </div>
  );
}
