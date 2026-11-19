// Server-side data access for Server Components: every read happens here, on the Next server, with the user's session cookie
// forwarded to the API. Pages render with data already in them (no client fetch, no spinner). Mutations stay in the browser
// (api from ./api) and call router.refresh() afterwards so the server re-reads.
import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import createClient from "openapi-fetch";
import type { paths } from "./api-types";
import { ApiError, type Role, type User } from "./api";
import { HOME } from "./home";

const API = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";
export type ServerApi = ReturnType<typeof createClient<paths>>;

/** Typed client bound to this request's cookie. A hung backend fails after 10 s instead of rendering forever. */
export async function serverApi(): Promise<ServerApi> {
  const cookie = (await cookies()).toString();
  return createClient<paths>({
    baseUrl: API,
    headers: { cookie },
    fetch: (req) => fetch(req, { cache: "no-store", signal: AbortSignal.timeout(10_000) }),
  });
}

type Result<T> = { data?: T; error?: unknown; response: Response };

/** Run one API read. 401 -> /login, 403/404 -> the not-found page, anything else throws to the segment's error.tsx. */
export async function load<T>(call: (api: ServerApi) => Promise<Result<T>>): Promise<T> {
  const { data, error, response } = await call(await serverApi());
  if (response.status === 401) redirect("/login");
  if (response.status === 403 || response.status === 404) notFound();
  if (error !== undefined || data === undefined) {
    const detail = (error as { detail?: unknown } | undefined)?.detail;
    throw new ApiError(typeof detail === "string" ? detail : `HTTP ${response.status}`, response.status);
  }
  return data;
}

/** Like load, but 404 returns null (for "may not exist yet" data such as a plan). */
export async function loadOptional<T>(call: (api: ServerApi) => Promise<Result<T>>): Promise<T | null> {
  const { data, response } = await call(await serverApi());
  if (response.status === 401) redirect("/login");
  if (response.status === 404) return null;
  if (response.status === 403) notFound();
  if (data === undefined) throw new ApiError(`HTTP ${response.status}`, response.status);
  return data;
}

/** The logged-in user, or null. Cached per request, so layouts and pages can both call it. */
export const getMe = cache(async (): Promise<User | null> => {
  const { data, response } = await (await serverApi()).GET("/api/auth/me");
  if (response.status === 401) return null;
  if (!data) throw new ApiError(`HTTP ${response.status}`, response.status);
  return data;
});

/** Guard for layouts and pages: not logged in -> /login, wrong role -> that role's own home. */
export async function requireRole(role: Role): Promise<User> {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== role) redirect(HOME[me.role]);
  return me;
}
