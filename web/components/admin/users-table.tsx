"use client";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NativeSelect } from "@/components/admin/fields";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type User } from "@/lib/api";

const H = "h-11 px-3 text-[0.8125rem] font-normal text-muted-foreground";

export function UsersTable({ users, doctors, doctorOf }: { users: User[]; doctors: User[]; doctorOf: Record<number, number | null> }) {
  const router = useRouter();
  const assign = useMutation({
    mutationFn: async (v: { patient_id: number; doctor_id: number }) => {
      const { error, response } = await api.PUT("/api/admin/patients/{patient_id}/doctor", { params: { path: { patient_id: v.patient_id } }, body: { doctor_id: v.doctor_id } });
      if (error !== undefined) throw new Error(`HTTP ${response.status}`);
    },
    onSuccess: () => toast.success("Doctor assigned"),
    onError: (e) => toast.error(e.message),
    onSettled: () => router.refresh(),
  });

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent"><TableHead className={H}>Name</TableHead><TableHead className={H}>Email</TableHead><TableHead className={H}>Role</TableHead><TableHead className={H}>Assign doctor</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id} className="h-11 hover:bg-muted/50">
              <TableCell className="px-3 font-medium">{u.name}</TableCell>
              <TableCell className="px-3">{u.email}</TableCell>
              <TableCell className="px-3"><span className="capitalize text-muted-foreground">{u.role}</span></TableCell>
              <TableCell className="px-3">
                {u.role === "patient" && (
                  <NativeSelect
                    aria-label={`Doctor for ${u.name}`}
                    className="w-44"
                    key={`${u.id}-${doctorOf[u.id] ?? ""}`}
                    defaultValue={doctorOf[u.id] ?? ""}
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
  );
}
