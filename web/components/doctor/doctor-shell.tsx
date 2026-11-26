"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { useLogout } from "@/lib/auth";
import type { User } from "@/lib/api";

const NAV = [
  { href: "/doctor", label: "Patients" },
  { href: "/doctor/methods", label: "How it's measured" },
];

export function DoctorShell({ me, children }: { me: User; children: React.ReactNode }) {
  const path = usePathname();
  const logoutMutation = useLogout();
  const logout = () => logoutMutation.mutate();
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row print:block">
      <aside className="flex items-center justify-between gap-x-4 bg-rail px-4 py-3 text-rail-foreground lg:sticky lg:top-0 lg:h-dvh lg:w-[248px] lg:shrink-0 lg:flex-col lg:items-stretch lg:justify-start lg:gap-0 lg:px-5 lg:py-7 print:hidden">
        <Link href="/doctor" aria-label="Arc, patients" className="flex min-h-11 items-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/60">
          <Wordmark />
        </Link>
        <nav aria-label="Doctor portal" className="flex flex-1 gap-1 lg:mt-10 lg:flex-none lg:flex-col">
          {NAV.map((n) => {
            // "Patients" owns every /doctor page except the methods reference
            const active = n.href === "/doctor" ? !path.startsWith("/doctor/methods") : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-11 items-center rounded-lg px-2 text-[0.95rem] outline-none transition-colors lg:px-3 duration-150 focus-visible:ring-3 focus-visible:ring-sidebar-ring/60 ${active ? "font-medium text-rail-foreground lg:bg-sidebar-accent lg:font-normal lg:text-sidebar-accent-foreground" : "text-rail-muted hover:text-rail-foreground lg:hover:bg-sidebar-accent/60"}`}
              >
                {active && <span aria-hidden="true" className="absolute inset-y-2.5 hidden lg:block left-0 w-0.5 rounded-full bg-brass" />}
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 lg:mt-auto lg:flex-col lg:items-start lg:gap-1 lg:border-t lg:border-sidebar-border lg:pt-5">
          <span className="hidden max-w-40 truncate text-sm text-rail-foreground lg:inline lg:max-w-full">{me.name}</span>
          <button
            type="button"
            onClick={logout}
            className="-mx-2 min-h-11 rounded-lg px-2 text-sm text-rail-muted outline-none transition-colors duration-150 hover:text-rail-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/60"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-8 lg:px-10 lg:py-12 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
