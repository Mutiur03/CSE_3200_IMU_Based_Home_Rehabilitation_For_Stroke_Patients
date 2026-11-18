// Typed API client. Types come from the backend OpenAPI schema: run `npm run gen:api` after server/openapi.json changes.
// Same-origin: in dev next.config.ts rewrites /api/* to FastAPI; in Docker/cloud Caddy routes /api/* to it.
import createClient from "openapi-fetch";
import type { components, paths } from "./api-types";

export const api = createClient<paths>({ baseUrl: "", credentials: "include" });

export type Schemas = components["schemas"];
export type User = Schemas["UserOut"];
export type Role = User["role"];

/** Unwrap an openapi-fetch result: return data or throw an Error with the server's message. */
export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await p;
  if (error !== undefined || data === undefined) {
    const detail = (error as { detail?: unknown } | undefined)?.detail;
    throw new Error(typeof detail === "string" ? detail : `HTTP ${response.status}`);
  }
  return data;
}
