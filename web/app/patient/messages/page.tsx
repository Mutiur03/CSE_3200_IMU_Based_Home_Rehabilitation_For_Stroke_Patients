"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ErrorNote, Loading } from "@/components/app-shell";
import { fmtDate } from "@/components/patient/util";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, unwrap } from "@/lib/api";
import { useMe } from "@/lib/auth";

const schema = z.object({ body: z.string().trim().min(1, "Write a message first").max(2000, "Too long (2000 characters max)") });
type Form = z.infer<typeof schema>;

export default function MessagesPage() {
  const qc = useQueryClient();
  const id = useMe().data?.id ?? 0;
  const key = ["messages", id];
  const path = { params: { path: { patient_id: id } } };
  const q = useQuery({ queryKey: key, queryFn: () => unwrap(api.GET("/api/patients/{patient_id}/messages", path)), enabled: id > 0 });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) });
  const send = useMutation({
    mutationFn: (v: Form) => unwrap(api.POST("/api/patients/{patient_id}/messages", { ...path, body: v })),
    onSuccess: () => {
      reset();
      qc.invalidateQueries({ queryKey: key });
    },
  });

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} retry={() => q.refetch()} />;
  const msgs = [...q.data].sort((a, b) => a.created_at.localeCompare(b.created_at));

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
      <form onSubmit={handleSubmit((v) => send.mutate(v))} className="mt-12 grid gap-3 border-t border-border pt-10" noValidate>
        <Label htmlFor="body" className="text-lg">Write a message</Label>
        <Textarea id="body" rows={4} className="bg-card text-lg" aria-invalid={!!errors.body} aria-describedby={errors.body ? "body-err" : undefined} {...register("body")} />
        {errors.body && <p id="body-err" className="text-base text-destructive">{errors.body.message}</p>}
        {send.error && <ErrorNote error={send.error} />}
        <Button type="submit" size="xl" className="sm:w-52" disabled={send.isPending}>{send.isPending ? "Sending..." : "Send message"}</Button>
      </form>
    </div>
  );
}
