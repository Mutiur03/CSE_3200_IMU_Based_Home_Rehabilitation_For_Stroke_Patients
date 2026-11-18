import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
      <span>{error instanceof Error ? error.message : "Something went wrong."}</span>
      {retry && (
        <Button size="sm" variant="outline" onClick={retry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>;
}
