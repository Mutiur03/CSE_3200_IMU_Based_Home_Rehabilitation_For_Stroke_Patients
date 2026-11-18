"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type User } from "@/lib/api";
import { Wordmark } from "@/components/brand";
import { Loading } from "@/components/doctor/states";

class Unauthed extends Error {}

const NAV = [{ href: "/doctor", label: "Patients" }];

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
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
  const target = me.error instanceof Unauthed ? "/login" : user && user.role !== "doctor" ? (user.role === "admin" ? "/admin" : "/patient") : null;
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
    <div className="flex min-h-dvh flex-col md:flex-row print:block">
      <aside className="flex items-center justify-between gap-x-4 bg-rail px-4 py-3 text-rail-foreground md:sticky md:top-0 md:h-dvh md:w-[248px] md:shrink-0 md:flex-col md:items-stretch md:justify-start md:gap-0 md:px-5 md:py-7 print:hidden">
        <Link href="/doctor" aria-label="Arc, patients" className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/60">
          <Wordmark />
        </Link>
        <nav aria-label="Doctor portal" className="flex flex-1 gap-1 md:mt-10 md:flex-none md:flex-col">
          {NAV.map((n) => {
            const active = path === n.href || path.startsWith(`${n.href}/`);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-11 items-center rounded-lg px-2 text-[0.95rem] outline-none transition-colors md:px-3 duration-150 focus-visible:ring-3 focus-visible:ring-sidebar-ring/60 ${active ? "font-medium text-rail-foreground md:bg-sidebar-accent md:font-normal md:text-sidebar-accent-foreground" : "text-rail-muted hover:text-rail-foreground md:hover:bg-sidebar-accent/60"}`}
              >
                {active && <span aria-hidden="true" className="absolute inset-y-2.5 hidden md:block left-0 w-0.5 rounded-full bg-brass" />}
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 md:mt-auto md:flex-col md:items-start md:gap-1 md:border-t md:border-sidebar-border md:pt-5">
          <span className="hidden max-w-40 truncate text-sm text-rail-foreground md:inline md:max-w-full">{user.name}</span>
          <button
            type="button"
            onClick={logout}
            className="-mx-2 min-h-11 rounded-lg px-2 text-sm text-rail-muted outline-none transition-colors duration-150 hover:text-rail-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/60"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-8 md:px-10 md:py-12 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
