"use client";
import { useQuery } from "@tanstack/react-query";
import { ErrorNote, Loading } from "@/components/app-shell";
import { TrendChart } from "@/components/patient/trend-chart";
import { fmtDay, num } from "@/components/patient/util";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, unwrap } from "@/lib/api";
import { useMe } from "@/lib/auth";

export default function ProgressPage() {
  const id = useMe().data?.id ?? 0;
  const q = useQuery({
    queryKey: ["progress", id],
    queryFn: () => unwrap(api.GET("/api/patients/{patient_id}/progress", { params: { path: { patient_id: id } } })),
    enabled: id > 0,
  });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} retry={() => q.refetch()} />;

  const { sessions, improvement, assessments } = q.data;
  const finished = sessions.filter((s) => s.ended_at).sort((a, b) => a.started_at.localeCompare(b.started_at));
  const rows = finished.map((s) => ({
    x: fmtDay(s.started_at),
    quality: s.mean_quality,
    roll: s.mean_roll_range_deg,
    pitch: s.mean_pitch_range_deg,
    duration: s.mean_duration_s,
  }));

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">My progress</h1>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">No finished sessions yet. Your charts will appear after your first session.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <TrendChart title="Movement quality score" unit="" rows={rows} series={[{ key: "quality", label: "Quality", color: "var(--primary)" }]} />
          <TrendChart title="Range of movement" unit="°" rows={rows} series={[{ key: "roll", label: "Roll range", color: "var(--primary)" }, { key: "pitch", label: "Pitch range", color: "var(--chart-2)" }]} />
          <TrendChart title="Time per repetition" unit=" s" rows={rows} series={[{ key: "duration", label: "Duration", color: "var(--chart-2)" }]} />
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg">Improvement index</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-base">
          <p className="text-3xl font-semibold">{improvement.index == null ? "Not enough sessions yet" : `${num(improvement.index, 1)} %`}</p>
          {improvement.metrics.length > 0 && (
            <ul className="grid gap-1">
              {improvement.metrics.map((m) => (
                <li key={m.name}>{m.name.replace("_", " ")}: {num(m.baseline, 1)} to {num(m.current, 1)} ({m.improvement_pct >= 0 ? "+" : ""}{num(m.improvement_pct, 1)} %)</li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">{improvement.note}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">My doctor&apos;s marks</CardTitle></CardHeader>
        <CardContent className="grid gap-4 text-base">
          {assessments.length === 0 && <p className="text-muted-foreground">Your doctor has not marked a session yet.</p>}
          {assessments.map((a) => (
            <div key={a.id} className="grid gap-1 border-b pb-3 last:border-0">
              <p className="font-medium">{new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(a.assessed_on + "T00:00"))}</p>
              <p>Range {a.rubric.range}, smoothness {a.rubric.smoothness}, control {a.rubric.control}, adherence {a.rubric.adherence}, overall {a.rubric.overall} (each 1 to 5)</p>
              {a.scale_name && <p>{a.scale_name}: {a.scale_score ?? "-"}</p>}
              {a.comment && <p className="text-muted-foreground">{a.comment}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
