import { RailShell } from "@/components/rail-shell";
import { requireRole } from "@/lib/server-api";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireRole("admin");
  return <RailShell me={me} nav={[{ href: "/admin", label: "Users and devices" }]}>{children}</RailShell>;
}
