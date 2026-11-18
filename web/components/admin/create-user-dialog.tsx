"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { FieldError, NativeSelect } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, unwrap, type User } from "@/lib/api";

const schema = z.object({
  role: z.enum(["patient", "doctor", "admin"]),
  name: z.string().trim().min(1, "Enter a name").max(120),
  email: z.string().trim().min(1, "Enter an email").max(254),
  password: z.string().min(8, "At least 8 characters").max(128),
  doctor_id: z.string(),
  affected_side: z.enum(["", "left", "right"]),
  onset_date: z.string(),
});
type Form = z.infer<typeof schema>;

export function CreateUserDialog({ doctors }: { doctors: User[] }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { register, handleSubmit, reset, control, setError, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { role: "patient", name: "", email: "", password: "", doctor_id: "", affected_side: "", onset_date: "" },
  });
  const isPatient = useWatch({ control, name: "role" }) === "patient";
  const create = useMutation({
    mutationFn: (v: Form) =>
      unwrap(
        api.POST("/api/admin/users", {
          body: {
            role: v.role,
            name: v.name,
            email: v.email,
            password: v.password,
            ...(v.role === "patient" && {
              doctor_id: v.doctor_id ? Number(v.doctor_id) : null,
              affected_side: v.affected_side || null,
              onset_date: v.onset_date || null,
            }),
          },
        }),
      ),
    onSuccess: (u) => {
      toast.success(`Created ${u.name}`);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      reset();
      setOpen(false);
    },
    onError: (e) => setError("root", { message: e.message }),
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>Create user</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
            <DialogDescription>The user logs in with this email and password.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit((v) => create.mutate(v))} className="grid gap-3" noValidate>
            <div className="grid gap-1.5">
              <Label htmlFor="cu-role">Role</Label>
              <NativeSelect id="cu-role" {...register("role")}>
                <option value="patient">Patient</option>
                <option value="doctor">Doctor</option>
                <option value="admin">Admin</option>
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cu-name">Name</Label>
              <Input id="cu-name" autoComplete="off" aria-invalid={!!errors.name} aria-describedby="cu-name-err" {...register("name")} />
              <FieldError id="cu-name-err" msg={errors.name?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cu-email">Email</Label>
              <Input id="cu-email" type="email" autoComplete="off" aria-invalid={!!errors.email} aria-describedby="cu-email-err" {...register("email")} />
              <FieldError id="cu-email-err" msg={errors.email?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cu-pw">Password (8 or more characters)</Label>
              <Input id="cu-pw" type="password" autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby="cu-pw-err" {...register("password")} />
              <FieldError id="cu-pw-err" msg={errors.password?.message} />
            </div>
            {isPatient && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="cu-doc">Doctor</Label>
                  <NativeSelect id="cu-doc" {...register("doctor_id")}>
                    <option value="">None yet</option>
                    {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </NativeSelect>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="cu-side">Affected side</Label>
                    <NativeSelect id="cu-side" {...register("affected_side")}>
                      <option value="">Not set</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                    </NativeSelect>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="cu-onset">Onset date</Label>
                    <Input id="cu-onset" type="date" {...register("onset_date")} />
                  </div>
                </div>
              </>
            )}
            {errors.root && <p role="alert" className="text-sm text-destructive">{errors.root.message}</p>}
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating..." : "Create user"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
