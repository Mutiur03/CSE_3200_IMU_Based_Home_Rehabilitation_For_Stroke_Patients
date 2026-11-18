// Arc wordmark. The mark is a forearm sweep: a quarter arc ending in a brass point (the hand at end of range).
export function ArcMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" className={className}>
      <path d="M4 23.5A19.5 19.5 0 0 1 23.5 4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="23.5" cy="4.5" r="2.7" fill="var(--brass)" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <ArcMark />
      <span className="font-display text-[1.6rem] leading-none tracking-tight">Arc</span>
    </span>
  );
}
