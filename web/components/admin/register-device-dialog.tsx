"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { FieldError, NativeSelect } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, unwrap, type Schemas, type User } from "@/lib/api";

const schema = z.object({
  device_id: z.string().min(1, "Enter a device id").max(64).regex(/^[A-Za-z0-9_-]+$/, "Letters, digits, - and _ only"),
  patient_id: z.string(),
});
type Form = z.infer<typeof schema>;

export function RegisterDeviceDialog({ patients }: { patients: User[] }) {
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<Schemas["DeviceRegisterOut"] | null>(null);
  const qc = useQueryClient();
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { device_id: "", patient_id: "" } });
  const create = useMutation({
    mutationFn: (v: Form) => unwrap(api.POST("/api/admin/devices", { body: { device_id: v.device_id, patient_id: v.patient_id ? Number(v.patient_id) : null } })),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["admin-devices"] });
      reset();
      setOpen(false);
      setIssued(d);
    },
    onError: (e) => setError("root", { message: e.message }),
  });

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed. Select the key and copy it by hand.");
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Register device</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register device</DialogTitle>
            <DialogDescription>Creates the wristband&apos;s id and a secret key.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit((v) => create.mutate(v))} className="grid gap-3" noValidate>
            <div className="grid gap-1.5">
              <Label htmlFor="rd-id">Device id</Label>
              <Input id="rd-id" autoComplete="off" placeholder="imu_01" aria-invalid={!!errors.device_id} aria-describedby="rd-id-err" {...register("device_id")} />
              <FieldError id="rd-id-err" msg={errors.device_id?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rd-patient">Patient (optional)</Label>
              <NativeSelect id="rd-patient" {...register("patient_id")}>
                <option value="">Unassigned</option>
                {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </NativeSelect>
            </div>
            {errors.root && <p role="alert" className="text-sm text-destructive">{errors.root.message}</p>}
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Registering..." : "Register device"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!issued} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Device key for {issued?.device_id}</DialogTitle>
            <DialogDescription>
              Copy it now. It cannot be shown again. Put it in the firmware <code>secrets.h</code> as <code>DEVICE_KEY</code>.
            </DialogDescription>
          </DialogHeader>
          <code className="block break-all rounded-lg border bg-muted p-3 font-mono text-sm select-all">{issued?.device_key}</code>
          <div className="flex gap-2">
            <Button onClick={() => issued && copy(issued.device_key)}>Copy key</Button>
            <Button variant="outline" onClick={() => setIssued(null)}>I have saved it</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
