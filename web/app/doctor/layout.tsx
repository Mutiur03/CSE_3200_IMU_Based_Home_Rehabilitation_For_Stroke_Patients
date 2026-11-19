import { DoctorShell } from "@/components/doctor/doctor-shell";
import { requireRole } from "@/lib/server-api";

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const me = await requireRole("doctor");
  return <DoctorShell me={me}>{children}</DoctorShell>;
}
