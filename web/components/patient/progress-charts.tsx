"use client";
import { useState } from "react";
import { TrendChart, type Series } from "./trend-chart";

type Row = Record<string, string | number | null | undefined>;
type View = { id: string; tab: string; title: string; help: string; unit: string; series: Series[] };

const VIEWS: View[] = [
  { id: "quality", tab: "Quality", title: "Movement quality score", help: "Higher is better. Each point is one session (average of its repetitions).", unit: "", series: [{ key: "quality", label: "Quality", color: "var(--primary)" }] },
  { id: "range", tab: "Range", title: "How far you move", help: "Degrees of forearm movement per repetition. Larger usually means a wider movement.", unit: "°", series: [{ key: "roll", label: "Turning (palm up/down)", color: "var(--chart-1)" }, { key: "pitch", label: "Raising (up/down)", color: "var(--chart-3)" }] },
  { id: "force", tab: "Force", title: "Strongest push or pull", help: "The most force you applied in a repetition, averaged over each session, in kg. Ask your doctor what to aim for.", unit: " kg", series: [{ key: "load", label: "Peak force", color: "var(--chart-2)" }] },
  { id: "time", tab: "Time", title: "Time per repetition", help: "Seconds for one repetition. Slow and controlled is fine.", unit: " s", series: [{ key: "duration", label: "Duration", color: "var(--primary)" }] },
];

/** One chart at a time, chosen with a segmented control, so the page is not a wall of three charts. */
export function ProgressCharts({ rows }: { rows: Row[] }) {
  // The Force tab only exists once some session has load cell data.
  const views = rows.some((r) => typeof r.load === "number") ? VIEWS : VIEWS.filter((x) => x.id !== "force");
  const [id, setId] = useState(VIEWS[0].id);
  const v = views.find((x) => x.id === id) ?? views[0];
  return (
    <div>
      <div role="group" aria-label="Choose a chart" className="inline-flex rounded-lg border border-border bg-card p-1">
        {views.map((x) => (
          <button
            key={x.id}
            type="button"
            aria-pressed={x.id === id}
            onClick={() => setId(x.id)}
            className={`min-h-11 rounded-md px-5 text-base transition-colors ${x.id === id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}
          >
            {x.tab}
          </button>
        ))}
      </div>
      <p className="mt-4 max-w-[60ch] text-muted-foreground">{v.help}</p>
      <div className="mt-4 rounded-xl border border-border bg-card p-4 md:p-6">
        <TrendChart key={v.id} title={v.title} unit={v.unit} rows={rows} series={v.series} />
      </div>
    </div>
  );
}
