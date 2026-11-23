import "server-only";
import { CORRELATION_ID_HEADER } from "@originos/contracts";
import { cookies, headers } from "next/headers";
import { loadWebServerEnv } from "./env";
import type { Me } from "./session-types";

export type ApiResult<T> =
  | { readonly ok: true; readonly status: number; readonly data: T }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: string;
      readonly message: string;
    };

/**
 * Call the API from server code as the signed-in person: forwards the session
 * cookie, the correlation ID and this app's origin (the API's CSRF check).
 * Never throws for HTTP errors; an unreachable API is status 0.
 */
export async function apiFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<ApiResult<T>> {
  const env = loadWebServerEnv();
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const requestHeaders: Record<string, string> = {
    accept: "application/json",
    origin: new URL(env.ORIGINOS_PUBLIC_URL).origin,
  };
  const cookie = cookieStore.toString();
  if (cookie) requestHeaders.cookie = cookie;
  const correlationId = headerStore.get(CORRELATION_ID_HEADER);
  if (correlationId) requestHeaders[CORRELATION_ID_HEADER] = correlationId;
  if (init.body !== undefined) requestHeaders["content-type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(new URL(path, env.ORIGINOS_API_URL), {
      method: init.method ?? "GET",
      headers: requestHeaders,
      cache: "no-store",
      signal: AbortSignal.timeout(init.timeoutMs ?? 5_000),
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      error: "api_unreachable",
      message: "The OriginOS API did not answer. Try again shortly.",
    };
  }
  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (response.ok) return { ok: true, status: response.status, data: body as T };
  const err = (body ?? {}) as { error?: unknown; message?: unknown };
  return {
    ok: false,
    status: response.status,
    error: typeof err.error === "string" ? err.error : "request_failed",
    message: typeof err.message === "string" ? err.message : "The request failed.",
  };
}

export type { Me, Membership } from "./session-types";

/** The signed-in person, or null when signed out (or the session is no longer valid). */
export async function getMe(): Promise<Me | null> {
  const result = await apiFetch<Me>("/v1/me");
  if (result.ok) return result.data;
  if (result.status === 401) return null;
  throw new Error(`Could not load the session: ${result.error}`);
}
