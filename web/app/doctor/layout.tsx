"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type User } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/doctor/states";

class Unauthed extends Error {}

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useQuery<User>({
    queryKey: ["auth", "me"],
    retry: false,
    queryFn: async () => {
      const { data, response } = await api.GET("/api/auth/me");
      if (response.status === 401) throw new Unauthed();
      if (!data) throw new Error(`HTTP ${response.status}`);
      return data;
    },
  });
  const user = me.data;
  const target =
    me.error instanceof Unauthed ? "/login" : user && user.role !== "doctor" ? (user.role === "admin" ? "/admin" : "/patient") : null;
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  async function logout() {
    await api.POST("/api/auth/logout");
    qc.clear();
    router.replace("/login");
  }

  if (me.error && !(me.error instanceof Unauthed))
    return (
      <p role="alert" className="p-6 text-destructive">
        Could not load your account: {me.error.message}
      </p>
    );
  if (!user || target)
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <Loading rows={3} />
      </div>
    );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card print:hidden">
        <nav aria-label="Doctor portal" className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/doctor" className="font-semibold focus-visible:outline-2 focus-visible:outline-ring">
            Doctor portal
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{user.name}</span>
            <Button variant="outline" size="sm" onClick={logout}>
              Log out
            </Button>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
