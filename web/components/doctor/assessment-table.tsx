import type { Schemas } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TD, TH, fmtDate } from "./format";

export function AssessmentTable({ items }: { items: Schemas["AssessmentOut"][] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No marks recorded yet. Add your first marks in the Marking tab.</p>;
  const sorted = [...items].sort((a, b) => b.assessed_on.localeCompare(a.assessed_on));
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={TH}>Date</TableHead>
          <TableHead className={`${TH} text-right`}>Range</TableHead>
          <TableHead className={`${TH} text-right`}>Smoothness</TableHead>
          <TableHead className={`${TH} text-right`}>Control</TableHead>
          <TableHead className={`${TH} text-right`}>Adherence</TableHead>
          <TableHead className={`${TH} text-right`}>Overall</TableHead>
          <TableHead className={TH}>Scale</TableHead>
          <TableHead className={TH}>Comment</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((a) => (
          <TableRow key={a.id}>
            <TableCell className={TD}>{fmtDate(a.assessed_on)}</TableCell>
            <TableCell className={`${TD} text-right`}>{a.rubric.range}</TableCell>
            <TableCell className={`${TD} text-right`}>{a.rubric.smoothness}</TableCell>
            <TableCell className={`${TD} text-right`}>{a.rubric.control}</TableCell>
            <TableCell className={`${TD} text-right`}>{a.rubric.adherence}</TableCell>
            <TableCell className={`${TD} text-right`}>{a.rubric.overall}</TableCell>
            <TableCell className={TD}>{a.scale_name ? `${a.scale_name}: ${a.scale_score ?? "n/a"}` : "None"}</TableCell>
            <TableCell className="max-w-64 whitespace-normal px-3 py-2.5 text-muted-foreground">{a.comment ?? ""}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
