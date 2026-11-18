// Status as text + dot, never colour alone.
const TONE = {
  neutral: "bg-muted text-muted-foreground",
  moss: "bg-moss/12 text-moss",
  amber: "bg-amber/12 text-amber",
  madder: "bg-madder/10 text-madder",
  brass: "bg-brass/15 text-brass-ink",
} as const;

export function StatusPill({ tone = "neutral", children }: { tone?: keyof typeof TONE; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[tone]}`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
