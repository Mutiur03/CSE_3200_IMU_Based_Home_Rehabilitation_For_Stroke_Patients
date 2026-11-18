const dateF = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateTimeF = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export const fmtDate = (s?: string | null) => (s ? dateF.format(new Date(s)) : "n/a");
export const fmtDateTime = (s?: string | null) => (s ? dateTimeF.format(new Date(s)) : "n/a");
export const fmtNum = (n?: number | null, d = 1) => (n == null ? "n/a" : n.toFixed(d));
export const fmtPct = (n?: number | null) => (n == null ? "n/a" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);
export const metricLabel = (s: string) => s.replace(/_/g, " ");

/** Table styling shared by the doctor tables. */
export const TH = "h-11 px-3 text-[0.8125rem] font-normal text-muted-foreground";
export const TD = "h-11 px-3 py-0 tnum";

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
export function fmtRelative(s?: string | null) {
  if (!s) return "No sessions yet";
  const days = Math.round((new Date(s).getTime() - Date.now()) / 86_400_000);
  if (days > -1) return "Today";
  if (days > -45) return rtf.format(days, "day");
  return rtf.format(Math.round(days / 30), "month");
}
export const signTone = (n?: number | null) => (n == null ? "text-muted-foreground" : n > 0 ? "text-moss" : n < 0 ? "text-amber" : "text-foreground");
