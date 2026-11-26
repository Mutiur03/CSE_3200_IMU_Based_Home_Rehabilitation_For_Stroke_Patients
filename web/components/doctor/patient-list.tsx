"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { StatusPill } from "@/components/status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Schemas } from "@/lib/api";
import { Empty } from "./states";
import { ScrollFade } from "./scroll-fade";
import { TD, TH, fmtDateTime, fmtRelative } from "./format";

// Words, not raw values. Same rules as the clinical report (server report.py).
const TREND = {
  improving: { label: "Improving", tone: "moss" },
  stable: { label: "Stable", tone: "neutral" },
  declining: { label: "Declining", tone: "madder" },
  insufficient: { label: "Not enough data", tone: "amber" },
} as const;
const BAND = { high: { label: "High", tone: "moss" }, moderate: { label: "Moderate", tone: "neutral" }, low: { label: "Low", tone: "amber" } } as const;
const TREND_RANK = { improving: 3, stable: 2, declining: 1, insufficient: 0 };
const BAND_RANK = { high: 3, moderate: 2, low: 1 };

type Sort = "name" | "last" | "quality" | "trend";

export function PatientList({ patients }: { patients: Schemas["PatientSummary"][] }) {
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("name");

  const rows = useMemo(() => {
    const list = patients.filter((p) => !flaggedOnly || p.flags.length > 0);
    return [...list].sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "last"
          ? (b.last_session_at ?? "").localeCompare(a.last_session_at ?? "")
          : sort === "quality"
            ? (b.quality_band ? BAND_RANK[b.quality_band] : 0) - (a.quality_band ? BAND_RANK[a.quality_band] : 0)
            : TREND_RANK[b.status ?? "insufficient"] - TREND_RANK[a.status ?? "insufficient"],
    );
  }, [patients, flaggedOnly, sort]);

  const all = patients;
  // eslint-disable-next-line react-hooks/purity -- coarse "last 7 days" count, recomputed on each data change
  const weekAgo = Date.now() - 7 * 86_400_000;
  const active = all.filter((p) => p.last_session_at && new Date(p.last_session_at).getTime() >= weekAgo).length;

  return (
    <section>
      <PageHeader title="Patients" description="Everyone assigned to you, with their movement quality and whether it is improving compared with their own first sessions." />

      <div className="mb-10 grid grid-cols-3 gap-x-6">
          <Stat label="Patients" value={all.length} />
          <Stat label="Flagged" value={all.filter((p) => p.flags.length > 0).length} />
          <Stat label="Active in the last 7 days" value={active} />
      </div>

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
            <option value="quality">Quality</option>
            <option value="trend">Trend</option>
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty>{flaggedOnly ? "No flagged patients. Clear the filter to see everyone." : "No patients are assigned to you yet. Ask an administrator to assign patients to your account."}</Empty>
      ) : (
        <ScrollFade>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={TH}>Name</TableHead>
                <TableHead className={`${TH} hidden md:table-cell`}>Device</TableHead>
                <TableHead className={`${TH} hidden md:table-cell`}>Last session</TableHead>
                <TableHead className={`${TH} hidden text-right md:table-cell`}>Sessions</TableHead>
                <TableHead className={`${TH} hidden md:table-cell`}>Quality</TableHead>
                <TableHead className={TH}>Trend</TableHead>
                <TableHead className={`${TH} hidden md:table-cell`}>Flags</TableHead>
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
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-2 text-sm md:hidden">
                      {p.quality_band && <span className="text-muted-foreground">Quality {BAND[p.quality_band].label.toLowerCase()}</span>}
                      {p.flags.map((f) => (
                        <StatusPill key={f.kind} tone="madder">
                          {f.message}
                        </StatusPill>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className={`${TD} hidden text-muted-foreground md:table-cell`}>{p.device_id ?? "None"}</TableCell>
                  <TableCell className={`${TD} hidden md:table-cell`}>
                    <span title={fmtDateTime(p.last_session_at)}>{fmtRelative(p.last_session_at)}</span>
                  </TableCell>
                  <TableCell className={`${TD} hidden text-right md:table-cell`}>{p.sessions_total}</TableCell>
                  <TableCell className={`${TD} hidden md:table-cell`}>
                    {p.quality_band ? <StatusPill tone={BAND[p.quality_band].tone}>{BAND[p.quality_band].label}</StatusPill> : <span className="text-muted-foreground">Not scored</span>}
                  </TableCell>
                  <TableCell className={TD}>
                    <StatusPill tone={TREND[p.status ?? "insufficient"].tone}>{TREND[p.status ?? "insufficient"].label}</StatusPill>
                  </TableCell>
                  <TableCell className={`${TD} hidden md:table-cell`}>
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
        </ScrollFade>
      )}
      <p className="mt-6 max-w-[62ch] text-[0.8125rem] text-muted-foreground">Quality and trend are descriptive and relative to each patient&apos;s own sessions, not clinically validated. See How it&apos;s measured.</p>
    </section>
  );
}
