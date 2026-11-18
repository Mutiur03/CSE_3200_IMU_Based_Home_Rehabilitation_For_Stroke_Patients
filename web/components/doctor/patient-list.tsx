"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, ErrorBox, Loading } from "./states";
import { fmtDateTime, fmtNum, fmtPct } from "./format";
import { usePatients } from "./queries";

type Sort = "name" | "last" | "quality" | "index";

export function PatientList() {
  const q = usePatients();
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("name");

  const rows = useMemo(() => {
    const list = (q.data ?? []).filter((p) => !flaggedOnly || p.flags.length > 0);
    const num = (v: number | null | undefined) => v ?? -Infinity;
    return [...list].sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "last"
          ? (b.last_session_at ?? "").localeCompare(a.last_session_at ?? "")
          : sort === "quality"
            ? num(b.mean_quality) - num(a.mean_quality)
            : num(b.improvement_index) - num(a.improvement_index),
    );
  }, [q.data, flaggedOnly, sort]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Patients</h1>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Checkbox id="flagged" aria-label="Flagged only" checked={flaggedOnly} onCheckedChange={(v) => setFlaggedOnly(v === true)} />
            <Label htmlFor="flagged">Flagged only</Label>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="sort">Sort by</Label>
            <select
              id="sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="h-8 rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
            >
              <option value="name">Name</option>
              <option value="last">Last session</option>
              <option value="quality">Mean quality</option>
              <option value="index">Improvement index</option>
            </select>
          </div>
        </div>
      </div>

      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorBox error={q.error} retry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <Empty>{flaggedOnly ? "No flagged patients." : "No patients assigned to you yet."}</Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Last session</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">Mean quality</TableHead>
              <TableHead className="text-right">Improvement index</TableHead>
              <TableHead>Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/doctor/patients/${p.id}`} className="font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell>{p.device_id ?? "none"}</TableCell>
                <TableCell>{fmtDateTime(p.last_session_at)}</TableCell>
                <TableCell className="text-right">{p.sessions_total}</TableCell>
                <TableCell className="text-right">{fmtNum(p.mean_quality)}</TableCell>
                <TableCell className="text-right">{fmtPct(p.improvement_index)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {p.flags.length === 0 ? (
                      <span className="text-muted-foreground">none</span>
                    ) : (
                      p.flags.map((f) => (
                        <Badge key={f.kind} variant="destructive" className="h-auto whitespace-normal">
                          {f.message}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="text-xs text-muted-foreground">
        Improvement index is descriptive and relative to each patient&apos;s own baseline; it is not clinically validated.
      </p>
    </section>
  );
}
