import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/server-api";

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const me = await requireRole("patient");
  return (
    <AppShell me={me} nav={[{ href: "/patient", label: "Home" }, { href: "/patient/progress", label: "My progress" }, { href: "/patient/messages", label: "Messages" }]}>
      {children}
    </AppShell>
  );
}
