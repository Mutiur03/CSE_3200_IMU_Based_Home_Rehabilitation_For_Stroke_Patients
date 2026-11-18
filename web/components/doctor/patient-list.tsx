"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { StatusPill } from "@/components/status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, ErrorBox, Loading } from "./states";
import { TD, TH, fmtDateTime, fmtNum, fmtPct, fmtRelative, signTone } from "./format";
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

  const all = q.data ?? [];
  // eslint-disable-next-line react-hooks/purity -- coarse "last 7 days" count, recomputed on each data change
  const weekAgo = Date.now() - 7 * 86_400_000;
  const active = all.filter((p) => p.last_session_at && new Date(p.last_session_at).getTime() >= weekAgo).length;

  return (
    <section>
      <PageHeader title="Patients" description="Everyone assigned to you, with their latest movement quality score and how it has changed from their own baseline." />

      {q.data && (
        <div className="mb-10 grid grid-cols-3 gap-x-6">
          <Stat label="Patients" value={all.length} />
          <Stat label="Flagged" value={all.filter((p) => p.flags.length > 0).length} />
          <Stat label="Active in the last 7 days" value={active} />
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
        <div className="flex min-h-11 items-center gap-2.5">
          <Checkbox id="flagged" aria-label="Flagged only" checked={flaggedOnly} onCheckedChange={(v) => setFlaggedOnly(v === true)} />
          <Label htmlFor="flagged">Flagged only</Label>
        </div>
        <div className="flex items-center gap-2.5">
          <Label htmlFor="sort" className="text-muted-foreground">
            Sort by
          </Label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-11 rounded-lg border border-input bg-card px-3 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <option value="name">Name</option>
            <option value="last">Last session</option>
            <option value="quality">Mean quality</option>
            <option value="index">Improvement index</option>
          </select>
        </div>
      </div>

      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorBox error={q.error} retry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <Empty>{flaggedOnly ? "No flagged patients. Clear the filter to see everyone." : "No patients are assigned to you yet. Ask an administrator to assign patients to your account."}</Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={TH}>Name</TableHead>
              <TableHead className={TH}>Device</TableHead>
              <TableHead className={TH}>Last session</TableHead>
              <TableHead className={`${TH} text-right`}>Sessions</TableHead>
              <TableHead className={`${TH} text-right`}>Mean quality</TableHead>
              <TableHead className={`${TH} text-right`}>Improvement index</TableHead>
              <TableHead className={TH}>Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className={TD}>
                  <Link
                    href={`/doctor/patients/${p.id}`}
                    className="-mx-1 inline-flex min-h-11 items-center rounded px-1 font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell className={`${TD} text-muted-foreground`}>{p.device_id ?? "None"}</TableCell>
                <TableCell className={TD}>
                  <span title={fmtDateTime(p.last_session_at)}>{fmtRelative(p.last_session_at)}</span>
                </TableCell>
                <TableCell className={`${TD} text-right`}>{p.sessions_total}</TableCell>
                <TableCell className={`${TD} text-right`}>
                  <span className="font-display text-xl">{fmtNum(p.mean_quality)}</span>
                </TableCell>
                <TableCell className={`${TD} text-right`}>
                  <span className={`font-display text-xl ${signTone(p.improvement_index)}`}>{fmtPct(p.improvement_index)}</span>
                </TableCell>
                <TableCell className={TD}>
                  <div className="flex gap-1.5">
                    {p.flags.length === 0 ? (
                      <span className="text-muted-foreground">None</span>
                    ) : (
                      p.flags.map((f) => (
                        <StatusPill key={f.kind} tone="madder">
                          {f.message}
                        </StatusPill>
                      ))
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="mt-6 max-w-[62ch] text-[0.8125rem] text-muted-foreground">
        Improvement index is descriptive and relative to each patient&apos;s own baseline. It is not clinically validated.
      </p>
    </section>
  );
}
