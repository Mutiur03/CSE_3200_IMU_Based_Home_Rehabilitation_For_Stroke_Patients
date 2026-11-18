"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ErrorNote, Loading } from "@/components/app-shell";
import { fmtDate } from "@/components/patient/util";
import { Badge } from "@/components/ui/badge";
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
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Messages with my doctor</h1>
      <ul className="grid gap-3" aria-label="Messages">
        {msgs.length === 0 && <li className="text-muted-foreground">No messages yet. Write the first one below.</li>}
        {msgs.map((m) => {
          const mine = m.from_user === id;
          return (
            <li key={m.id} className={`max-w-[85%] rounded-xl border p-3 text-base ${mine ? "ml-auto bg-muted" : "bg-card"}`}>
              <div className="mb-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{mine ? "You" : m.from_name}</span>
                <span>{fmtDate(m.created_at)}</span>
                {!mine && !m.read_at && <Badge>New</Badge>}
              </div>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          );
        })}
      </ul>
      <form onSubmit={handleSubmit((v) => send.mutate(v))} className="grid gap-3" noValidate>
        <Label htmlFor="body" className="text-base">Write a message</Label>
        <Textarea id="body" rows={4} className="text-base" aria-invalid={!!errors.body} aria-describedby={errors.body ? "body-err" : undefined} {...register("body")} />
        {errors.body && <p id="body-err" className="text-sm text-destructive">{errors.body.message}</p>}
        {send.error && <ErrorNote error={send.error} />}
        <Button type="submit" size="lg" className="h-12 text-base sm:w-40" disabled={send.isPending}>{send.isPending ? "Sending..." : "Send"}</Button>
      </form>
    </div>
  );
}
