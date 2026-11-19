"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, unwrap, type Schemas } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Empty } from "./states";
import { fmtDateTime } from "./format";

export function MessagesTab({ id, messages }: { id: number; messages: Schemas["MessageOut"][] }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const send = useMutation({
    mutationFn: (b: string) => unwrap(api.POST("/api/patients/{patient_id}/messages", { params: { path: { patient_id: id } }, body: { body: b } })),
    onSuccess: () => {
      setBody("");
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-[1.5rem] leading-tight">Messages</h2>
      {messages.length === 0 ? (
        <Empty>No messages yet. Write the first one below.</Empty>
      ) : (
        <ul className="divide-y divide-border border-y border-border" aria-label="Message thread">
          {messages.map((m) => (
            <li key={m.id} className={`px-3 py-4 text-sm ${m.from_user === id ? "bg-muted/60" : ""}`}>
              <p className="mb-1 text-[0.8125rem] text-muted-foreground">
                <span className="font-medium text-foreground">{m.from_name}</span> <span className="tnum">{fmtDateTime(m.created_at)}</span>
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
        className="space-y-2.5"
      >
        <Label htmlFor="msg">New message</Label>
        <Textarea id="msg" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
        <Button type="submit" size="lg" disabled={send.isPending || !body.trim()}>
          {send.isPending ? "Sending..." : "Send message"}
        </Button>
      </form>
    </div>
  );
}
