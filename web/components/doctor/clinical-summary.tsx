import type { Schemas } from "@/lib/api";
import { StatusPill } from "@/components/status-pill";

type Report = Schemas["ClinicalReport"];

const STATUS: Record<Report["status"], { label: string; tone: "moss" | "neutral" | "madder" | "amber" }> = {
  improving: { label: "Improving", tone: "moss" },
  stable: { label: "Stable", tone: "neutral" },
  declining: { label: "Declining", tone: "madder" },
  insufficient: { label: "Not enough data", tone: "amber" },
};
const TONE: Record<string, string> = { good: "bg-moss", watch: "bg-amber", alert: "bg-madder", neutral: "bg-border" };
const TONE_WORD: Record<string, string> = { good: "positive", watch: "watch", alert: "needs attention", neutral: "" };

/** The plain-language report from the server (report.py). No raw values: words, bands and percent change only. */
export function ClinicalSummary({ r, compact = false }: { r: Report; compact?: boolean }) {
  const st = STATUS[r.status];
  const sections = r.sections.filter((s) => !compact || s.points.length > 0 || s.key === "adherence");
  return (
    <div className="space-y-6">
      <section aria-labelledby="sum-h" className="rounded-xl border border-border bg-card p-6 md:p-8 print:border-0 print:p-0">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="sum-h" className="text-[1.5rem] leading-tight">Summary</h2>
          <StatusPill tone={st.tone}>{st.label}</StatusPill>
        </div>
        <p className="mt-3 max-w-[70ch] text-[1.0625rem] leading-relaxed">{r.headline}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 print:block print:space-y-4">
        {sections.map((s) => (
          <section key={s.key} aria-labelledby={`sec-${s.key}`} className="break-inside-avoid rounded-xl border border-border bg-card p-5 md:p-6 print:border-0 print:p-0">
            <h3 id={`sec-${s.key}`} className="text-lg font-medium">{s.title}</h3>
            <p className="mt-1 text-[0.9375rem] text-muted-foreground print:text-neutral-700">{s.summary}</p>
            {s.points.length > 0 && (
              <ul className="mt-4 space-y-3">
                {s.points.map((p) => (
                  <li key={p.label + p.text} className="flex gap-3">
                    <span aria-hidden="true" className={`mt-2 size-2 shrink-0 rounded-full ${TONE[p.tone]}`} />
                    <p className="text-[0.9375rem]">
                      <span className="font-medium">{p.label}:</span> {p.text}
                      {TONE_WORD[p.tone] && <span className="sr-only"> ({TONE_WORD[p.tone]})</span>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
