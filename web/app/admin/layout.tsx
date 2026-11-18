"use client";
import { ErrorNote, Loading } from "@/components/app-shell";
import { RailShell } from "@/components/rail-shell";
import { useRequireRole } from "@/lib/auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { me, isError, refetch } = useRequireRole("admin");
  if (isError) return <div className="p-4"><ErrorNote error={new Error("Cannot reach the server.")} retry={refetch} /></div>;
  if (!me) return <Loading />;
  return <RailShell me={me} nav={[{ href: "/admin", label: "Users and devices" }]}>{children}</RailShell>;
}
