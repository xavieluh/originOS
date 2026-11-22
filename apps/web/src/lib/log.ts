import "server-only";

type Level = "info" | "warn" | "error";

/**
 * Minimal structured (JSON lines) logger for web server code, matching the
 * field names of the API's pino logs (`level`, `time`, `msg`, `correlationId`).
 * Callers pass identifiers and statuses only; never request bodies or secrets.
 */
export function logEvent(
  level: Level,
  msg: string,
  fields: Readonly<Record<string, string | number | boolean | undefined>> = {},
  write: (line: string) => void = (line) => process.stdout.write(line),
): void {
  const numeric = { info: 30, warn: 40, error: 50 }[level];
  write(
    `${JSON.stringify({ level: numeric, time: Date.now(), service: "web", msg, ...fields })}\n`,
  );
}
