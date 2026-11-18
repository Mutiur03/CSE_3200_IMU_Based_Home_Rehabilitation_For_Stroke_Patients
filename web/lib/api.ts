// Typed API client. Types come from the backend OpenAPI schema: run `npm run gen:api` after server/openapi.json changes.
// Same-origin: in dev next.config.ts rewrites /api/* to FastAPI; in Docker/cloud Caddy routes /api/* to it.
import createClient from "openapi-fetch";
import type { components, paths } from "./api-types";

export const api = createClient<paths>({ baseUrl: "", credentials: "include" });

export type Schemas = components["schemas"];
export type User = Schemas["UserOut"];
export type Role = User["role"];

/** Error from a non-2xx API reply; `status` lets the UI choose between "try again" and "not found". */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Unwrap an openapi-fetch result: return data or throw an Error with the server's message. */
export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await p;
  if (error !== undefined || data === undefined) {
    const detail = (error as { detail?: unknown } | undefined)?.detail;
    const notFound = response.status === 403 || response.status === 404;
    throw new ApiError(notFound ? "Not found, or you do not have access to it." : typeof detail === "string" ? detail : `HTTP ${response.status}`, response.status);
  }
  return data;
}
