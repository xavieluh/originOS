import type { IncomingMessage } from "node:http";
import { CORRELATION_ID_HEADER, resolveCorrelationId } from "@originos/contracts";
import { LogController } from "fastify";

const CREDENTIAL_KEYS = [
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "secret",
  "apiKey",
  "authorization",
  "cookie",
  "connectionString",
  "databaseUrl",
] as const;

/**
 * Paths removed from every structured log line. Request bodies are never
 * logged by default. Credential-named keys are censored at the top level and
 * one level down; header objects are censored wherever they are logged.
 */
export const REDACTED_LOG_PATHS: readonly string[] = [
  ...CREDENTIAL_KEYS,
  ...CREDENTIAL_KEYS.map((key) => `*.${key}`),
  "headers.authorization",
  "headers.cookie",
  'headers["x-api-key"]',
  'headers["x-ingest-key"]',
  "*.headers.authorization",
  "*.headers.cookie",
  '*.headers["x-api-key"]',
  '*.headers["x-ingest-key"]',
  'res.headers["set-cookie"]',
];

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

/** Where log lines go. Defaults to stdout; tests pass a capturing stream. */
export interface LogDestination {
  write(line: string): void;
}

/**
 * Drop the query string from logged URLs. Links in emails (email verification,
 * password reset) carry one-time tokens in the query, and a URL is logged on
 * every request, so query strings are never written to logs.
 */
export function redactUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  const q = url.indexOf("?");
  return q === -1 ? url : `${url.slice(0, q)}?[REDACTED]`;
}

interface LoggedRequest {
  method?: string | undefined;
  url?: string | undefined;
  host?: string | undefined;
  hostname?: string | undefined;
  ip?: string | undefined;
  socket?: { remotePort?: number | undefined } | undefined;
}

export function loggerOptions(level: LogLevel, stream?: LogDestination) {
  return {
    level,
    redact: { paths: [...REDACTED_LOG_PATHS], censor: "[REDACTED]" },
    serializers: {
      req: (req: LoggedRequest) => {
        const out: Record<string, string | number> = {};
        const url = redactUrl(req.url);
        const host = req.host ?? req.hostname;
        if (req.method) out.method = req.method;
        if (url) out.url = url;
        if (host) out.host = host;
        if (req.ip) out.remoteAddress = req.ip;
        if (req.socket?.remotePort !== undefined) out.remotePort = req.socket.remotePort;
        return out;
      },
    },
    ...(stream ? { stream } : {}),
  };
}

/**
 * Fastify constructor options shared by every OriginOS HTTP process, including
 * the NestJS API's FastifyAdapter: redacted logger and correlation IDs as request IDs.
 */
export function fastifyBaseOptions(level: LogLevel, stream?: LogDestination) {
  return {
    logger: loggerOptions(level, stream),
    genReqId: (req: IncomingMessage) => resolveCorrelationId(req.headers[CORRELATION_ID_HEADER]),
    logController: new LogController({ requestIdLogLabel: "correlationId" }),
  };
}
