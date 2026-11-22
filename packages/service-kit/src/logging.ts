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

export function loggerOptions(level: LogLevel) {
  return {
    level,
    redact: { paths: [...REDACTED_LOG_PATHS], censor: "[REDACTED]" },
  };
}

/**
 * Fastify constructor options shared by every OriginOS HTTP process, including
 * the NestJS API's FastifyAdapter: redacted logger and correlation IDs as request IDs.
 */
export function fastifyBaseOptions(level: LogLevel) {
  return {
    logger: loggerOptions(level),
    genReqId: (req: IncomingMessage) => resolveCorrelationId(req.headers[CORRELATION_ID_HEADER]),
    logController: new LogController({ requestIdLogLabel: "correlationId" }),
  };
}
