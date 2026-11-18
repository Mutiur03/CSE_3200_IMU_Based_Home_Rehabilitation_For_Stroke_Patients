// Optimistic gate only (Next 16 "proxy", formerly middleware): no session cookie -> /login.
// Real authorization is enforced by the API on every call; pages read the role from GET /api/auth/me.
import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  if (!req.cookies.has("session")) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/patient/:path*", "/doctor/:path*", "/admin/:path*"] };
