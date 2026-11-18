// Signature: a forearm roll trace, drawn once. The single memorable element of the product; use it on login only.
export function TraceArt({ className = "" }: { className?: string }) {
  const brass = "M0 210 C 70 210 90 70 160 70 S 250 330 330 330 S 420 150 500 150 S 590 262 670 262 S 760 112 840 112 S 930 228 1010 228 S 1100 168 1200 168";
  const spruce = "M0 250 C 80 250 110 160 190 160 S 280 300 360 300 S 450 200 530 200 S 620 276 700 276 S 790 190 870 190 S 960 250 1040 250 S 1120 214 1200 214";
  return (
    <svg viewBox="0 0 1200 400" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMid slice" className={className}>
      <path d={spruce} stroke="var(--sidebar-accent)" strokeWidth="2" strokeLinecap="round" style={{ ["--len" as string]: 1800 }} className="draw-once" />
      <path d={brass} stroke="var(--brass)" strokeWidth="2.5" strokeLinecap="round" style={{ ["--len" as string]: 1800 }} className="draw-once" />
      <line x1="0" x2="1200" y1="200" y2="200" stroke="var(--sidebar-border)" strokeWidth="1" strokeDasharray="2 8" />
    </svg>
  );
}
