"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ErrorNote, Loading } from "@/components/app-shell";
import { NativeSelect } from "@/components/admin/fields";
import { CreateUserDialog } from "@/components/admin/create-user-dialog";
import { RegisterDeviceDialog } from "@/components/admin/register-device-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, unwrap } from "@/lib/api";

export default function AdminPage() {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => unwrap(api.GET("/api/admin/users")) });
  const devices = useQuery({ queryKey: ["admin-devices"], queryFn: () => unwrap(api.GET("/api/admin/devices")) });
  const assign = useMutation({
    mutationFn: async (v: { patient_id: number; doctor_id: number }) => {
      const { error, response } = await api.PUT("/api/admin/patients/{patient_id}/doctor", { params: { path: { patient_id: v.patient_id } }, body: { doctor_id: v.doctor_id } });
      if (error !== undefined) throw new Error(`HTTP ${response.status}`);
    },
    onSuccess: () => toast.success("Doctor assigned"),
    onError: (e) => toast.error(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const err = users.error ?? devices.error;
  if (err) return <ErrorNote error={err} retry={() => { users.refetch(); devices.refetch(); }} />;
  if (!users.data || !devices.data) return <Loading />;

  const doctors = users.data.filter((u) => u.role === "doctor");
  const patients = users.data.filter((u) => u.role === "patient");
  const name = (id: number | null) => (id == null ? "Unassigned" : (users.data.find((u) => u.id === id)?.name ?? `#${id}`));

  return (
    <div className="grid gap-10">
      <section className="grid gap-3" aria-labelledby="users-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 id="users-h" className="text-xl font-semibold">Users</h1>
          <CreateUserDialog doctors={doctors} />
        </div>
        {users.data.length === 0 ? (
          <p className="text-muted-foreground">No users yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Assign doctor</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {users.data.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell><Badge variant="secondary">{u.role}</Badge></TableCell>
                    <TableCell>
                      {u.role === "patient" && (
                        <NativeSelect
                          aria-label={`Doctor for ${u.name}`}
                          className="w-44"
                          defaultValue=""
                          disabled={assign.isPending || doctors.length === 0}
                          onChange={(e) => e.target.value && assign.mutate({ patient_id: u.id, doctor_id: Number(e.target.value) })}
                        >
                          <option value="">Choose doctor...</option>
                          {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </NativeSelect>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="dev-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="dev-h" className="text-xl font-semibold">Devices</h2>
          <RegisterDeviceDialog patients={patients} />
        </div>
        {devices.data.length === 0 ? (
          <p className="text-muted-foreground">No devices registered yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader><TableRow><TableHead>Device id</TableHead><TableHead>Patient</TableHead></TableRow></TableHeader>
              <TableBody>
                {devices.data.map((d) => (
                  <TableRow key={d.device_id}>
                    <TableCell className="font-mono">{d.device_id}</TableCell>
                    <TableCell>{name(d.patient_id)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
