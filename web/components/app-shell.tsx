"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLogout } from "@/lib/auth";
import type { User } from "@/lib/api";

export type NavItem = { href: string; label: string };

export function AppShell({ me, nav, children }: { me: User; nav: NavItem[]; children: React.ReactNode }) {
  const path = usePathname();
  const logout = useLogout();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-base font-semibold">IMU Rehab</span>
          <nav aria-label="Main" className="flex flex-1 flex-wrap gap-1">
            {nav.map((n) => {
              const active = n.href === nav[0].href ? path === n.href : path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-lg px-3 py-2 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{me.name}</span>
            <Button variant="outline" size="lg" onClick={() => logout.mutate()} disabled={logout.isPending}>
              <LogOut /> Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6">{children}</main>
    </div>
  );
}

export function Loading({ label = "Loading..." }: { label?: string }) {
  return (
    <div role="status" className="p-6 text-muted-foreground">
      {label}
    </div>
  );
}

export function ErrorNote({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 p-4 text-destructive">
      <span>{error instanceof Error ? error.message : "Something went wrong."}</span>
      {retry && (
        <Button variant="outline" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
