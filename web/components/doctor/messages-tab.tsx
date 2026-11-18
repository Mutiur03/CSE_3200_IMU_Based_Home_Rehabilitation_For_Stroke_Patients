"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Empty, ErrorBox, Loading } from "./states";
import { fmtDateTime } from "./format";
import { useMessages } from "./queries";

export function MessagesTab({ id }: { id: number }) {
  const qc = useQueryClient();
  const q = useMessages(id);
  const [body, setBody] = useState("");
  const send = useMutation({
    mutationFn: (b: string) => unwrap(api.POST("/api/patients/{patient_id}/messages", { params: { path: { patient_id: id } }, body: { body: b } })),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["doctor", "messages", id] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-lg font-semibold">Messages</h2>
      {q.isPending ? (
        <Loading rows={3} />
      ) : q.isError ? (
        <ErrorBox error={q.error} retry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Empty>No messages yet.</Empty>
      ) : (
        <ul className="space-y-2" aria-label="Message thread">
          {q.data.map((m) => (
            <li key={m.id} className={`rounded-lg border p-3 text-sm ${m.from_user === id ? "bg-muted" : "bg-card"}`}>
              <p className="mb-1 text-xs text-muted-foreground">
                {m.from_name} - {fmtDateTime(m.created_at)}
              </p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) send.mutate(body.trim());
        }}
        className="space-y-2"
      >
        <Label htmlFor="msg">New message</Label>
        <Textarea id="msg" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
        <Button type="submit" disabled={send.isPending || !body.trim()}>
          {send.isPending ? "Sending..." : "Send"}
        </Button>
      </form>
    </div>
  );
}
