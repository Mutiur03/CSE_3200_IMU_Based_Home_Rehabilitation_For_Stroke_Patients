import { CreateUserDialog } from "@/components/admin/create-user-dialog";
import { RegisterDeviceDialog } from "@/components/admin/register-device-dialog";
import { UsersTable } from "@/components/admin/users-table";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { load, serverApi } from "@/lib/server-api";

const H = "h-11 px-3 text-[0.8125rem] font-normal text-muted-foreground";

export default async function AdminPage() {
  const [users, devices] = await Promise.all([load((api) => api.GET("/api/admin/users")), load((api) => api.GET("/api/admin/devices"))]);
  const doctors = users.filter((u) => u.role === "doctor");
  const patients = users.filter((u) => u.role === "patient");

  // UserOut has no doctor_id, so read each patient's detail. A failed read leaves the select on "Choose doctor...".
  const api = await serverApi();
  const doctorOf: Record<number, number | null> = {};
  await Promise.all(
    patients.map(async (p) => {
      try {
        const { data } = await api.GET("/api/patients/{patient_id}", { params: { path: { patient_id: p.id } } });
        doctorOf[p.id] = data?.doctor_id ?? null;
      } catch {
        doctorOf[p.id] = null;
      }
    }),
  );
  const name = (id: number | null) => (id == null ? "Unassigned" : (users.find((u) => u.id === id)?.name ?? `#${id}`));

  return (
    <div>
      <PageHeader title="Users and devices" description="Create accounts, assign each patient a doctor, and register wristbands." />
      <section className="grid gap-4" aria-labelledby="users-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="users-h" className="text-[1.5rem]">Users</h2>
          <CreateUserDialog doctors={doctors} />
        </div>
        {users.length === 0 ? (
          <p className="text-muted-foreground">No users yet. Select Create user to add the first one.</p>
        ) : (
          <UsersTable users={users} doctors={doctors} doctorOf={doctorOf} />
        )}
      </section>

      <section className="mt-14 grid gap-4" aria-labelledby="dev-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="dev-h" className="text-[1.5rem]">Devices</h2>
          <RegisterDeviceDialog patients={patients} />
        </div>
        {devices.length === 0 ? (
          <p className="text-muted-foreground">No devices registered yet. Select Register device to add a wristband.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent"><TableHead className={H}>Device id</TableHead><TableHead className={H}>Patient</TableHead></TableRow></TableHeader>
              <TableBody>
                {devices.map((d) => (
                  <TableRow key={d.device_id} className="h-11 hover:bg-muted/50">
                    <TableCell className="px-3 font-mono">{d.device_id}</TableCell>
                    <TableCell className="px-3">{name(d.patient_id)}</TableCell>
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
