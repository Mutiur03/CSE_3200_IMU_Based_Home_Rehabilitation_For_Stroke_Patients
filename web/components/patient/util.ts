import { useQuery } from "@tanstack/react-query";
import { api, unwrap, type Schemas } from "@/lib/api";

export type Session = Schemas["SessionOut"];

export const fmtDate = (iso: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
export const fmtDay = (iso: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(iso));
export const num = (v: number | null | undefined, d = 0) => (v == null ? "-" : v.toFixed(d));

/** Start of the current week: Monday 00:00, local time. */
export function weekStart(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function useSessions(patientId: number) {
  return useQuery({
    queryKey: ["sessions", patientId],
    queryFn: () => unwrap(api.GET("/api/patients/{patient_id}/sessions", { params: { path: { patient_id: patientId } } })),
    enabled: patientId > 0,
  });
}
