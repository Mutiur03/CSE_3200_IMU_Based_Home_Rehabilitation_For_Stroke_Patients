"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ErrorNote } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, unwrap } from "@/lib/api";

const schema = z.object({ body: z.string().trim().min(1, "Write a message first").max(2000, "Too long (2000 characters max)") });
type Form = z.infer<typeof schema>;

export function MessageForm({ patientId }: { patientId: number }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<unknown>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });
  const pending = isSubmitting || refreshing;

  async function send(v: Form) {
    setError(null);
    try {
      await unwrap(api.POST("/api/patients/{patient_id}/messages", { params: { path: { patient_id: patientId } }, body: v }));
      reset();
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e);
    }
  }

  return (
    <form onSubmit={handleSubmit(send)} className="mt-12 grid gap-3 border-t border-border pt-10" noValidate>
      <Label htmlFor="body" className="text-lg">Write a message</Label>
      <Textarea id="body" rows={4} className="bg-card text-lg" aria-invalid={!!errors.body} aria-describedby={errors.body ? "body-err" : undefined} {...register("body")} />
      {errors.body && <p id="body-err" className="text-base text-destructive">{errors.body.message}</p>}
      {error != null && <ErrorNote error={error} />}
      <Button type="submit" size="xl" className="sm:w-52" disabled={pending}>{pending ? "Sending..." : "Send message"}</Button>
    </form>
  );
}
