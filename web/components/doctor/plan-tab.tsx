"use client";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, unwrap, type Schemas } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const int1 = (msg: string) => z.number({ error: msg }).int(msg).min(1, msg);

const planSchema = z.object({
  levels_allowed: z.array(z.number()).min(1, "Allow at least one level"),
  reps_per_level: int1("Whole number, at least 1"),
  sessions_per_week: int1("Whole number, at least 1"),
  adapt_on: z.boolean(),
});
type PlanValues = z.infer<typeof planSchema>;

function PlanForm({ id, plan }: { id: number; plan: Schemas["PlanOut"] | null }) {
  const router = useRouter();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<PlanValues>({
    resolver: zodResolver(planSchema),
    defaultValues: plan
      ? { levels_allowed: plan.levels_allowed, reps_per_level: plan.reps_per_level, sessions_per_week: plan.sessions_per_week, adapt_on: plan.adapt_on }
      : { levels_allowed: [], adapt_on: false },
  });
  const save = useMutation({
    mutationFn: (v: PlanValues) =>
      unwrap(api.PUT("/api/patients/{patient_id}/plan", { params: { path: { patient_id: id } }, body: { ...v, levels_allowed: [...v.levels_allowed].sort((a, b) => a - b) } })),
    onSuccess: () => {
      toast.success("Plan saved");
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="max-w-2xl space-y-6" noValidate>
      <h2 className="text-[1.5rem] leading-tight">Training plan</h2>
      {!plan && <p className="text-sm text-muted-foreground">No plan is set for this patient. Choose the levels they may play and save the plan to create one.</p>}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Levels allowed</legend>
        <Controller
          control={control}
          name="levels_allowed"
          render={({ field }) => (
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {LEVELS.map((l) => (
                <div key={l} className="flex min-h-11 items-center gap-2">
                  <Checkbox
                    id={`level-${l}`}
                    aria-label={`Level ${l}`}
                    checked={field.value.includes(l)}
                    onCheckedChange={(c) => field.onChange(c ? [...field.value, l] : field.value.filter((x) => x !== l))}
                  />
                  <Label htmlFor={`level-${l}`}>{l}</Label>
                </div>
              ))}
            </div>
          )}
        />
        {errors.levels_allowed && <p className="text-sm text-destructive">{errors.levels_allowed.message}</p>}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="reps_per_level">Reps per level</Label>
          <Input id="reps_per_level" className="h-11 tnum" type="number" min={1} step={1} aria-invalid={!!errors.reps_per_level} {...register("reps_per_level", { valueAsNumber: true })} />
          {errors.reps_per_level && <p className="text-xs text-destructive">{errors.reps_per_level.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sessions_per_week">Sessions per week</Label>
          <Input id="sessions_per_week" className="h-11 tnum" type="number" min={1} step={1} aria-invalid={!!errors.sessions_per_week} {...register("sessions_per_week", { valueAsNumber: true })} />
          {errors.sessions_per_week && <p className="text-xs text-destructive">{errors.sessions_per_week.message}</p>}
        </div>
      </div>
      <Controller
        control={control}
        name="adapt_on"
        render={({ field }) => (
          <div className="flex min-h-11 items-start gap-2.5 pt-3">
            <Checkbox id="adapt_on" aria-label="Adaptive difficulty on" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
            <Label htmlFor="adapt_on">Adaptive difficulty on (level moves up, repeats or down from mean movement quality score)</Label>
          </div>
        )}
      />
      <Button type="submit" size="lg" disabled={save.isPending}>
        {save.isPending ? "Saving..." : "Save plan"}
      </Button>
    </form>
  );
}

const alertSchema = z.object({
  max_days_without_session: z.string().refine((v) => v.trim() === "" || (Number.isInteger(Number(v)) && Number(v) >= 1), "Whole number, at least 1"),
  quality_drop_pct: z.string().refine((v) => v.trim() === "" || (Number(v) > 0 && Number(v) <= 100), "Greater than 0 and at most 100"),
});
type AlertValues = z.infer<typeof alertSchema>;

function AlertForm({ id, rule }: { id: number; rule: Schemas["AlertRuleIO"] | null }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AlertValues>({
    resolver: zodResolver(alertSchema),
    defaultValues: { max_days_without_session: rule?.max_days_without_session?.toString() ?? "", quality_drop_pct: rule?.quality_drop_pct?.toString() ?? "" },
  });
  const save = useMutation({
    mutationFn: (v: AlertValues) =>
      unwrap(
        api.PUT("/api/patients/{patient_id}/alert-rules", {
          params: { path: { patient_id: id } },
          body: {
            max_days_without_session: v.max_days_without_session.trim() === "" ? null : Number(v.max_days_without_session),
            quality_drop_pct: v.quality_drop_pct.trim() === "" ? null : Number(v.quality_drop_pct),
          },
        }),
      ),
    onSuccess: () => {
      toast.success("Alert rules saved");
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="max-w-2xl space-y-6" noValidate>
      <h2 className="text-[1.5rem] leading-tight">Alert rules</h2>
      <p className="text-sm text-muted-foreground">
        The system ships no default thresholds. A patient is flagged only when you set a rule here; leave a field empty to turn that rule off.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="max_days">Flag after this many days without a session</Label>
          <Input id="max_days" className="h-11" inputMode="numeric" aria-invalid={!!errors.max_days_without_session} {...register("max_days_without_session")} />
          {errors.max_days_without_session && <p className="text-xs text-destructive">{errors.max_days_without_session.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="drop_pct">Flag when quality drops by this percent</Label>
          <Input id="drop_pct" className="h-11" inputMode="decimal" aria-invalid={!!errors.quality_drop_pct} {...register("quality_drop_pct")} />
          {errors.quality_drop_pct && <p className="text-xs text-destructive">{errors.quality_drop_pct.message}</p>}
        </div>
      </div>
      <Button type="submit" size="lg" disabled={save.isPending}>
        {save.isPending ? "Saving..." : "Save alert rules"}
      </Button>
    </form>
  );
}

export function PlanTab({ id, plan, rule }: { id: number; plan: Schemas["PlanOut"] | null; rule: Schemas["AlertRuleIO"] | null }) {
  return (
    <div className="space-y-14">
      <PlanForm id={id} plan={plan} />
      <AlertForm id={id} rule={rule} />
    </div>
  );
}
