"use client";
import { Button } from "@/components/ui/button";

/** Shared body for the error.tsx files: a failed server read shows this with a retry (re-renders the segment on the server). */
export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto w-full max-w-xl px-5 py-14">
      <h1 className="text-[1.5rem] leading-tight">This page could not load</h1>
      <p className="mt-3 text-muted-foreground">{error.message || "The server did not answer."} Check that the backend and database are running, then try again.</p>
      <Button className="mt-6" onClick={reset}>Try again</Button>
    </div>
  );
}

export function RouteLoading() {
  return <div role="status" className="p-6 text-muted-foreground">Loading...</div>;
}
