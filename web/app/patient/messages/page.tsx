import type { Metadata } from "next";
import { MessageForm } from "@/components/patient/message-form";
import { fmtDate } from "@/components/patient/util";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { load, requireRole } from "@/lib/server-api";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const { id } = await requireRole("patient");
  const data = await load((api) => api.GET("/api/patients/{patient_id}/messages", { params: { path: { patient_id: id } } }));
  const msgs = [...data].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <div>
      <PageHeader title="Messages with my doctor" />
      <ul className="grid gap-4" aria-label="Messages">
        {msgs.length === 0 && <li className="text-muted-foreground">No messages yet. Write the first one below.</li>}
        {msgs.map((m) => {
          const mine = m.from_user === id;
          return (
            <li key={m.id} className={`max-w-[88%] rounded-xl border border-border px-5 py-4 ${mine ? "ml-auto bg-secondary" : "bg-card"}`}>
              <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-muted-foreground">
                <span className="font-medium text-foreground">{mine ? "You" : m.from_name}</span>
                <span>{fmtDate(m.created_at)}</span>
                {!mine && !m.read_at && <StatusPill tone="brass">New</StatusPill>}
              </div>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          );
        })}
      </ul>
      <MessageForm patientId={id} />
    </div>
  );
}
