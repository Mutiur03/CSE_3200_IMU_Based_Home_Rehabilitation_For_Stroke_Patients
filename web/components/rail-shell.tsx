"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { useLogout } from "@/lib/auth";
import type { NavItem } from "@/components/app-shell";
import type { User } from "@/lib/api";

/** Admin shell: 248px dark rail on desktop, a compact dark bar on small screens. Same concept as the doctor portal. */
export function RailShell({ me, nav, children }: { me: User; nav: NavItem[]; children: React.ReactNode }) {
  const path = usePathname();
  const logout = useLogout();
  const links = nav.map((n) => {
    const active = n.href === nav[0].href ? path === n.href : path.startsWith(n.href);
    return (
      <Link
        key={n.href}
        href={n.href}
        aria-current={active ? "page" : undefined}
        className={`relative flex h-11 items-center rounded-lg px-4 text-[0.95rem] transition-colors duration-150 ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-rail-muted hover:text-rail-foreground"}`}
      >
        {active && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 bg-brass" />}
        {n.label}
      </Link>
    );
  });
  const out = (
    <button
      type="button"
      onClick={() => logout.mutate()}
      disabled={logout.isPending}
      className="h-11 rounded-lg px-4 text-left text-[0.95rem] text-rail-muted transition-colors duration-150 hover:text-rail-foreground disabled:opacity-50"
    >
      Log out
    </button>
  );
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden bg-rail text-rail-foreground lg:flex lg:flex-col lg:px-3 lg:py-6">
        <Link href="/admin" aria-label="Arc admin home" className="mb-10 px-4"><Wordmark /></Link>
        <nav aria-label="Main" className="flex flex-col gap-1">{links}</nav>
        <div className="mt-auto flex flex-col gap-1 border-t border-sidebar-border pt-4">
          <div className="px-4 pb-2 text-sm text-rail-muted">{me.name}</div>
          {out}
        </div>
      </aside>
      <header className="flex flex-wrap items-center justify-between gap-x-3 bg-rail px-4 py-2 text-rail-foreground lg:hidden">
        <Wordmark />
        <nav aria-label="Main" className="order-3 flex w-full">{links}</nav>
        {out}
      </header>
      <main className="mx-auto w-full max-w-5xl px-5 py-8 md:px-10 md:py-12">{children}</main>
    </div>
  );
}
