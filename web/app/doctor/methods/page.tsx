import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { load } from "@/lib/server-api";

export const metadata: Metadata = { title: "How it's measured" };

// Content comes from the server (report.py methods()), built from the live constants, so it matches the code.
export default async function MethodsPage() {
  const items = await load((api) => api.GET("/api/methods"));
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="How it's measured"
        description="What each number in the reports means and how it is calculated. Everything is rule-based and compared with the patient's own earlier sessions; nothing is a clinical norm."
      />
      <ol className="grid gap-4">
        {items.map((m, i) => (
          <li key={m.title} className="rounded-xl border border-border bg-card p-5 md:p-6">
            <h2 className="flex items-baseline gap-3 font-sans text-lg font-medium">
              <span className="tnum text-[0.8125rem] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              {m.title}
            </h2>
            <p className="mt-2 leading-relaxed text-muted-foreground">{m.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
