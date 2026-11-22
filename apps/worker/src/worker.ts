import { type Database, databaseHealthCheck } from "@originos/db";
import { createHttpService } from "@originos/service-kit";
import type { FastifyInstance } from "fastify";
import type { WorkerEnv } from "./env.js";
import { type JobHandler, registeredHandlers } from "./handlers.js";

export const VERSION = process.env.ORIGINOS_VERSION ?? "0.0.0-dev";

export interface Worker {
  readonly health: FastifyInstance;
  readonly handlers: readonly JobHandler[];
  stop(): Promise<void>;
}

export function createWorker(
  env: Pick<WorkerEnv, "LOG_LEVEL">,
  database: Database | null,
  handlers: readonly JobHandler[] = registeredHandlers,
): Worker {
  const health = createHttpService({
    service: "worker",
    version: VERSION,
    logLevel: env.LOG_LEVEL,
    readinessChecks: { database: () => databaseHealthCheck(database) },
  });

  if (handlers.length === 0) {
    health.log.warn("No job handlers are registered; the job queue arrives in Phase 07.");
  }

  return {
    health,
    handlers,
    async stop() {
      await health.close();
      await database?.close();
    },
  };
}
