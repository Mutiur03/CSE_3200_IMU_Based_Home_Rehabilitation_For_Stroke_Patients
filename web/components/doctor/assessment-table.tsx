import type { Schemas } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "./format";

export function AssessmentTable({ items }: { items: Schemas["AssessmentOut"][] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No marks recorded yet.</p>;
  const sorted = [...items].sort((a, b) => b.assessed_on.localeCompare(a.assessed_on));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Range</TableHead>
          <TableHead className="text-right">Smoothness</TableHead>
          <TableHead className="text-right">Control</TableHead>
          <TableHead className="text-right">Adherence</TableHead>
          <TableHead className="text-right">Overall</TableHead>
          <TableHead>Scale</TableHead>
          <TableHead>Comment</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((a) => (
          <TableRow key={a.id}>
            <TableCell>{fmtDate(a.assessed_on)}</TableCell>
            <TableCell className="text-right">{a.rubric.range}</TableCell>
            <TableCell className="text-right">{a.rubric.smoothness}</TableCell>
            <TableCell className="text-right">{a.rubric.control}</TableCell>
            <TableCell className="text-right">{a.rubric.adherence}</TableCell>
            <TableCell className="text-right">{a.rubric.overall}</TableCell>
            <TableCell>{a.scale_name ? `${a.scale_name}: ${a.scale_score ?? "n/a"}` : "none"}</TableCell>
            <TableCell className="max-w-64 whitespace-normal">{a.comment ?? ""}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
