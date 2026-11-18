"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { useLogout } from "@/lib/auth";
import type { NavItem } from "@/components/app-shell";
import type { User } from "@/lib/api";

/** Admin shell: rail layout identical to the doctor portal (app/doctor/layout.tsx); keep the two in sync. */
export function RailShell({ me, nav, children }: { me: User; nav: NavItem[]; children: React.ReactNode }) {
  const path = usePathname();
  const logout = useLogout();
  return (
    <div className="flex min-h-dvh flex-col md:flex-row print:block">
      <aside className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-rail px-4 py-3 text-rail-foreground md:sticky md:top-0 md:h-dvh md:w-[248px] md:shrink-0 md:flex-col md:items-stretch md:justify-start md:gap-0 md:px-5 md:py-7 print:hidden">
        <Link href="/admin" aria-label="Arc, admin home" className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/60">
          <Wordmark />
        </Link>
        <nav aria-label="Admin portal" className="flex gap-1 md:mt-10 md:flex-col">
          {nav.map((n) => {
            const active = path === n.href || path.startsWith(`${n.href}/`);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-11 items-center rounded-lg px-3 text-[0.95rem] outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-sidebar-ring/60 ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-rail-muted hover:bg-sidebar-accent/60 hover:text-rail-foreground"}`}
              >
                {active && <span aria-hidden="true" className="absolute inset-y-2.5 left-0 w-0.5 rounded-full bg-brass" />}
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 md:mt-auto md:flex-col md:items-start md:gap-1 md:border-t md:border-sidebar-border md:pt-5">
          <span className="max-w-40 truncate text-sm text-rail-foreground md:max-w-full">{me.name}</span>
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="-mx-2 min-h-11 rounded-lg px-2 text-sm text-rail-muted outline-none transition-colors duration-150 hover:text-rail-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/60 disabled:opacity-50"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-8 md:px-10 md:py-12 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
