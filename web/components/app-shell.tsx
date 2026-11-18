"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { useLogout } from "@/lib/auth";
import type { User } from "@/lib/api";

export type NavItem = { href: string; label: string };

/** Patient shell: slim top bar, large targets, 18px base text. The play page gets the whole viewport. */
export function AppShell({ me, nav, children }: { me: User; nav: NavItem[]; children: React.ReactNode }) {
  const path = usePathname();
  const logout = useLogout();
  const play = path.startsWith("/patient/play");
  return (
    <div className={`flex flex-col text-lg ${play ? "h-dvh" : "min-h-dvh"}`}>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-8 gap-y-1 px-5">
          <Link href="/patient" aria-label="Arc home" className="flex h-16 items-center rounded-lg text-foreground">
            <Wordmark />
          </Link>
          <nav aria-label="Main" className="order-3 -mx-2 flex w-full gap-1 sm:order-none sm:mx-0 sm:w-auto sm:flex-1">
            {nav.map((n) => {
              const active = n.href === nav[0].href ? path === n.href : path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-14 items-center rounded-lg px-3 transition-colors duration-150 sm:h-16 ${active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {n.label}
                  {active && <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 bg-brass" />}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-4">
            <span className="hidden text-base text-muted-foreground md:inline">{me.name}</span>
            <Button variant="outline" size="lg" className="h-12 px-5 text-base" onClick={() => logout.mutate()} disabled={logout.isPending}>
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className={play ? "flex min-h-0 flex-1 flex-col" : "mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-10 md:py-14"}>{children}</main>
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
    <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-l-2 border-destructive py-1 pl-4 text-destructive">
      <span>{error instanceof Error ? error.message : "Something went wrong. Try again."}</span>
      {retry && (
        <Button variant="outline" size="lg" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
