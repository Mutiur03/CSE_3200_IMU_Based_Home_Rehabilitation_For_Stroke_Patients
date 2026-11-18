import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 px-4 py-3 text-sm text-destructive">
      <span>{error instanceof Error ? error.message : "Something went wrong. Check your connection and try again."}</span>
      {retry && (
        <Button size="sm" variant="outline" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}
