"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AssessmentTable } from "./assessment-table";
import { ErrorBox, Loading } from "./states";
import { useAssessments } from "./queries";

const rubricField = z.number({ error: "Enter a whole number 1 to 5" }).int("Whole number").min(1, "1 to 5").max(5, "1 to 5");
const schema = z.object({
  assessed_on: z.string().min(1, "Date is required"),
  range: rubricField,
  smoothness: rubricField,
  control: rubricField,
  adherence: rubricField,
  overall: rubricField,
  scale_name: z.string().max(60, "60 characters max"),
  scale_score: z.string().refine((v) => v.trim() === "" || Number.isFinite(Number(v)), "Must be a number"),
  comment: z.string().max(4000, "4000 characters max"),
});
type Values = z.infer<typeof schema>;

const RUBRIC = [
  ["range", "Range"],
  ["smoothness", "Smoothness"],
  ["control", "Control"],
  ["adherence", "Adherence"],
  ["overall", "Overall"],
] as const;

export function MarkingTab({ id }: { id: number }) {
  const qc = useQueryClient();
  const list = useAssessments(id);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { assessed_on: new Date().toLocaleDateString("sv"), scale_name: "", scale_score: "", comment: "" } });

  const save = useMutation({
    mutationFn: (v: Values) =>
      unwrap(
        api.POST("/api/patients/{patient_id}/assessments", {
          params: { path: { patient_id: id } },
          body: {
            assessed_on: v.assessed_on,
            rubric: { range: v.range, smoothness: v.smoothness, control: v.control, adherence: v.adherence, overall: v.overall },
            scale_name: v.scale_name.trim() || null,
            scale_score: v.scale_score.trim() === "" ? null : Number(v.scale_score),
            comment: v.comment.trim() || null,
          },
        }),
      ),
    onSuccess: () => {
      toast.success("Marks saved");
      reset({ assessed_on: new Date().toLocaleDateString("sv"), scale_name: "", scale_score: "", comment: "" });
      qc.invalidateQueries({ queryKey: ["doctor", "assessments", id] });
      qc.invalidateQueries({ queryKey: ["doctor", "progress", id] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-14">
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="max-w-2xl space-y-6" noValidate>
        <h2 className="text-[1.5rem] leading-tight">New marks</h2>
        <div className="space-y-1.5">
          <Label htmlFor="assessed_on">Assessed on</Label>
          <Input id="assessed_on" type="date" className="h-11 w-48" aria-invalid={!!errors.assessed_on} {...register("assessed_on")} />
          {errors.assessed_on && <p className="text-sm text-destructive">{errors.assessed_on.message}</p>}
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Rubric (1 = poor, 5 = good)</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {RUBRIC.map(([k, label]) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={k}>{label}</Label>
                <Input id={k} className="h-11 tnum" type="number" inputMode="numeric" min={1} max={5} step={1} aria-invalid={!!errors[k]} {...register(k, { valueAsNumber: true })} />
                {errors[k] && <p className="text-xs text-destructive">{errors[k]?.message}</p>}
              </div>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Clinical scale (optional)</legend>
          <p className="text-xs text-muted-foreground">Administered by you in person; stored only. The system does not compute or interpret it.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="scale_name">Scale name</Label>
              <Input id="scale_name" className="h-11" maxLength={60} {...register("scale_name")} />
              {errors.scale_name && <p className="text-xs text-destructive">{errors.scale_name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scale_score">Score</Label>
              <Input id="scale_score" className="h-11" inputMode="decimal" aria-invalid={!!errors.scale_score} {...register("scale_score")} />
              {errors.scale_score && <p className="text-xs text-destructive">{errors.scale_score.message}</p>}
            </div>
          </div>
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="comment">Comment</Label>
          <Textarea id="comment" rows={3} {...register("comment")} />
          {errors.comment && <p className="text-xs text-destructive">{errors.comment.message}</p>}
        </div>
        <Button type="submit" size="lg" disabled={save.isPending}>
          {save.isPending ? "Saving..." : "Save marks"}
        </Button>
      </form>

      <section className="space-y-4">
        <h2 className="text-[1.5rem] leading-tight">History</h2>
        {list.isPending ? <Loading rows={2} /> : list.isError ? <ErrorBox error={list.error} retry={() => list.refetch()} /> : <AssessmentTable items={list.data} />}
      </section>
    </div>
  );
}
