/** Header that carries a correlation ID across HTTP, jobs and agent actions (MASTER_SPEC §4). */
export const CORRELATION_ID_HEADER = "x-correlation-id";

// Accept caller-supplied IDs only if they are short and made of safe characters,
// so a client cannot inject log lines or oversized values.
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function isValidCorrelationId(value: unknown): value is string {
  return typeof value === "string" && CORRELATION_ID_PATTERN.test(value);
}

/** Use the caller's ID when valid, otherwise mint a new one. */
export function resolveCorrelationId(
  incoming: unknown,
  generate: () => string = () => crypto.randomUUID(),
): string {
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  return isValidCorrelationId(candidate) ? candidate : generate();
}
