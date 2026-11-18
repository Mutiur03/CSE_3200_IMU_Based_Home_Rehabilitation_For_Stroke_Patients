import type { Schemas } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtNum, fmtPct, metricLabel } from "./format";

export function ImprovementCard({ imp }: { imp: Schemas["Improvement"] }) {
  return (
    <Card className="break-inside-avoid">
      <CardHeader>
        <CardTitle>Improvement index</CardTitle>
        <CardDescription>
          Baseline: first {imp.baseline_sessions} sessions. Current: last {imp.current_sessions} sessions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-3xl font-semibold">{imp.index == null ? "n/a" : fmtPct(imp.index)}</p>
        <p className="text-sm text-muted-foreground">{imp.note}</p>
        {imp.metrics.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not enough sessions yet to compare a baseline with a current window.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">Baseline</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">Change (positive = better)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imp.metrics.map((m) => (
                <TableRow key={m.name}>
                  <TableCell className="capitalize">{metricLabel(m.name)}</TableCell>
                  <TableCell className="text-right">{fmtNum(m.baseline)}</TableCell>
                  <TableCell className="text-right">{fmtNum(m.current)}</TableCell>
                  <TableCell className="text-right">{fmtPct(m.improvement_pct)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
