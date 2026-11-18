// A measured value: serif numeral, quiet label. tone="brass" is reserved for the improvement index.
const TONE = { ink: "text-foreground", brass: "text-brass-ink", moss: "text-moss", amber: "text-amber", madder: "text-madder" } as const;
const SIZE = { md: "text-[2rem]", lg: "text-[3.5rem] md:text-[4.5rem]" } as const;

export function Stat({
  label,
  value,
  unit,
  note,
  tone = "ink",
  size = "md",
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  note?: React.ReactNode;
  tone?: keyof typeof TONE;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[0.8125rem] font-medium text-muted-foreground">{label}</div>
      <div className={`font-display tnum mt-1 leading-none ${SIZE[size]} ${TONE[tone]}`}>
        {value}
        {unit && <span className="ml-1 font-sans text-[0.9rem] font-normal text-muted-foreground">{unit}</span>}
      </div>
      {note && <div className="mt-2 text-[0.8125rem] text-muted-foreground">{note}</div>}
    </div>
  );
}
