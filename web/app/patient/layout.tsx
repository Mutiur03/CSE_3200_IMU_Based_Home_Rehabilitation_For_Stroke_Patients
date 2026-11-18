"use client";
import { AppShell, ErrorNote, Loading } from "@/components/app-shell";
import { useRequireRole } from "@/lib/auth";

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const { me, isError, refetch } = useRequireRole("patient");
  if (isError) return <div className="p-4"><ErrorNote error={new Error("Cannot reach the server.")} retry={refetch} /></div>;
  if (!me) return <Loading />;
  return (
    <AppShell me={me} nav={[{ href: "/patient", label: "Home" }, { href: "/patient/progress", label: "My progress" }, { href: "/patient/messages", label: "Messages" }]}>
      {children}
    </AppShell>
  );
}
