import Fastify, { type FastifyInstance } from "fastify";
import {
  CORRELATION_ID_HEADER,
  type DependencyCheck,
  type HealthResponse,
  type ServiceName,
  summarizeChecks,
} from "@originos/contracts";
import { type LogLevel, fastifyBaseOptions } from "./logging.js";

export type ReadinessCheck = () => Promise<DependencyCheck>;

export interface HttpServiceOptions {
  readonly service: ServiceName;
  readonly version: string;
  readonly logLevel: LogLevel;
  /** Dependency checks for `GET /health/ready`. Liveness never runs them. */
  readonly readinessChecks?: Readonly<Record<string, ReadinessCheck>>;
  readonly now?: () => Date;
}

/**
 * Build a Fastify instance with the conventions every OriginOS HTTP service shares:
 * redacted structured logs, a correlation ID on every request and response,
 * `GET /health/live` and `GET /health/ready`, and JSON 404s.
 */
export function createHttpService(options: HttpServiceOptions): FastifyInstance {
  const now = options.now ?? (() => new Date());
  const app = Fastify(fastifyBaseOptions(options.logLevel));

  app.addHook("onRequest", async (request, reply) => {
    reply.header(CORRELATION_ID_HEADER, request.id);
  });

  const respond = (checks: Record<string, DependencyCheck>): HealthResponse => ({
    service: options.service,
    status: summarizeChecks(checks),
    version: options.version,
    checkedAt: now().toISOString(),
    checks,
  });

  app.get("/health/live", async () => respond({}));

  app.get("/health/ready", async (_request, reply) => {
    const entries = await Promise.all(
      Object.entries(options.readinessChecks ?? {}).map(async ([name, check]) => {
        try {
          return [name, await check()] as const;
        } catch {
          return [
            name,
            { status: "error", detail: "check failed" } satisfies DependencyCheck,
          ] as const;
        }
      }),
    );
    const body = respond(Object.fromEntries(entries));
    return reply.code(body.status === "ok" ? 200 : 503).send(body);
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({ error: "not_found" });
  });

  return app;
}
