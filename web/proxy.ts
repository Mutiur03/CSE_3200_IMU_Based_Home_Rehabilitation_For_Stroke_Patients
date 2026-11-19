// Next 16 "proxy" (formerly middleware), runs on the server before the page renders.
// - Protected areas: no session cookie -> /login (optimistic; the API enforces real authorization on every call).
// - /login: if the cookie is a valid session (checked against the API, so no flash of the login form), go to that role's home.
import { NextResponse, type NextRequest } from "next/server";

const API = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";
const HOME: Record<string, string> = { patient: "/patient", doctor: "/doctor", admin: "/admin" };

export async function proxy(req: NextRequest) {
  const cookie = req.cookies.get("session");
  if (req.nextUrl.pathname === "/login") {
    if (!cookie) return NextResponse.next();
    try {
      const r = await fetch(`${API}/api/auth/me`, { headers: { cookie: `session=${cookie.value}` }, cache: "no-store" });
      const home = r.ok ? HOME[(await r.json()).role] : undefined;
      if (home) return NextResponse.redirect(new URL(home, req.url));
    } catch {
      // API unreachable: just show the login page
    }
    return NextResponse.next();
  }
  if (!cookie) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/login", "/patient/:path*", "/doctor/:path*", "/admin/:path*"] };
