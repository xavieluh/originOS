import {
  CORRELATION_ID_HEADER,
  type HealthResponse,
  HealthResponse as HealthResponseSchema,
} from "@originos/contracts";

export type ApiStatus =
  | { readonly kind: "ready"; readonly health: HealthResponse }
  | { readonly kind: "not_ready"; readonly health: HealthResponse }
  | { readonly kind: "unreachable" }
  | { readonly kind: "invalid_response" };

/**
 * Ask the API for readiness from the server. Every failure mode maps to an
 * explicit state so the page never shows a stale or invented "healthy".
 */
export async function fetchApiStatus(
  apiBaseUrl: string,
  options: {
    readonly fetchImpl?: typeof fetch;
    readonly timeoutMs?: number;
    /** Forwarded so the API's log lines share the web request's ID. */
    readonly correlationId?: string | undefined;
  } = {},
): Promise<ApiStatus> {
  const { fetchImpl = fetch, timeoutMs = 2_000, correlationId } = options;
  let response: Response;
  try {
    response = await fetchImpl(new URL("/health/ready", apiBaseUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        accept: "application/json",
        ...(correlationId ? { [CORRELATION_ID_HEADER]: correlationId } : {}),
      },
    });
  } catch {
    return { kind: "unreachable" };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: "invalid_response" };
  }
  const parsed = HealthResponseSchema.safeParse(body);
  if (!parsed.success || parsed.data.service !== "api") return { kind: "invalid_response" };
  return response.ok && parsed.data.status === "ok"
    ? { kind: "ready", health: parsed.data }
    : { kind: "not_ready", health: parsed.data };
}
