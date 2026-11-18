export function PageHeader({
  title,
  description,
  actions,
  className = "",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={`mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-border pb-6 ${className}`}>
      <div className="min-w-0">
        <h1 className="text-[2rem] leading-[1.08] md:text-[2.5rem]">{title}</h1>
        {description && <p className="mt-2.5 max-w-[62ch] text-[0.95rem] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
