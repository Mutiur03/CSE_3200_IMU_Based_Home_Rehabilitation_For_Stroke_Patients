import type { Schemas } from "@/lib/api";
import { Stat } from "@/components/stat";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollFade } from "./scroll-fade";
import { TD, TH, fmtNum, fmtPct, metricLabel, signTone } from "./format";

export function ImprovementCard({ imp }: { imp: Schemas["Improvement"] }) {
  return (
    <section aria-label="Improvement index" className="break-inside-avoid">
      <div className="flex flex-wrap items-end gap-x-12 gap-y-4">
        <Stat
          label="Improvement index"
          size="lg"
          tone="brass"
          value={imp.index == null ? "n/a" : fmtPct(imp.index)}
          note={`Baseline: first ${imp.baseline_sessions} sessions. Current: last ${imp.current_sessions} sessions.`}
        />
        <p className="max-w-[46ch] pb-1 text-[0.95rem] text-muted-foreground">{imp.note}</p>
      </div>
      {imp.metrics.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Not enough sessions yet to compare a baseline with a current window.</p>
      ) : (
        <ScrollFade className="mt-8">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={TH}>Metric</TableHead>
                <TableHead className={`${TH} text-right`}>Baseline</TableHead>
                <TableHead className={`${TH} text-right`}>Current</TableHead>
                <TableHead className={`${TH} text-right`}>
                  <span className="sm:hidden">Change</span>
                  <span className="hidden sm:inline">Change (positive = better)</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imp.metrics.map((m) => (
                <TableRow key={m.name}>
                  <TableCell className={`${TD} capitalize`}>{metricLabel(m.name)}</TableCell>
                  <TableCell className={`${TD} text-right`}>{fmtNum(m.baseline)}</TableCell>
                  <TableCell className={`${TD} text-right`}>{fmtNum(m.current)}</TableCell>
                  <TableCell className={`${TD} text-right ${signTone(m.improvement_pct)}`}>{fmtPct(m.improvement_pct)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollFade>
      )}
    </section>
  );
}
