const dateF = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateTimeF = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export const fmtDate = (s?: string | null) => (s ? dateF.format(new Date(s)) : "n/a");
export const fmtDateTime = (s?: string | null) => (s ? dateTimeF.format(new Date(s)) : "n/a");
export const fmtNum = (n?: number | null, d = 1) => (n == null ? "n/a" : n.toFixed(d));
export const fmtPct = (n?: number | null) => (n == null ? "n/a" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);
export const metricLabel = (s: string) => s.replace(/_/g, " ");
