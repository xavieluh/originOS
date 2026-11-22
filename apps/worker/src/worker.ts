import { type Database, databaseHealthCheck } from "@originos/db";
import { createHttpService } from "@originos/service-kit";
import type { FastifyInstance } from "fastify";
import type { WorkerEnv } from "./env.js";
import { type JobHandler, registeredConsumers, registeredHandlers } from "./handlers.js";
import {
  type OutboxConsumer,
  type OutboxDispatcher,
  createOutboxDispatcher,
} from "./outbox-dispatcher.js";

export const VERSION = process.env.ORIGINOS_VERSION ?? "0.0.0-dev";

export interface Worker {
  readonly health: FastifyInstance;
  readonly handlers: readonly JobHandler[];
  /** Null without a database. */
  readonly outbox: OutboxDispatcher | null;
  stop(): Promise<void>;
}

export interface WorkerOptions {
  readonly handlers?: readonly JobHandler[];
  readonly consumers?: readonly OutboxConsumer[];
  readonly workerId?: string;
}

export function createWorker(
  env: Pick<WorkerEnv, "LOG_LEVEL">,
  database: Database | null,
  options: WorkerOptions = {},
): Worker {
  const handlers = options.handlers ?? registeredHandlers;
  const consumers = options.consumers ?? registeredConsumers;
  const health = createHttpService({
    service: "worker",
    version: VERSION,
    logLevel: env.LOG_LEVEL,
    readinessChecks: { database: () => databaseHealthCheck(database) },
  });

  if (handlers.length === 0) {
    health.log.warn("No job handlers are registered; the job queue arrives in Phase 07.");
  }

  const outbox = database
    ? createOutboxDispatcher({
        db: database.db,
        consumers,
        workerId: options.workerId ?? `worker-${process.pid}-${Date.now().toString(36)}`,
        log: health.log,
      })
    : null;
  if (consumers.length === 0) {
    health.log.warn(
      "No outbox consumers are registered; events stay pending until a module registers one.",
    );
  }

  return {
    health,
    handlers,
    outbox,
    async stop() {
      await outbox?.stop();
      await health.close();
      await database?.close();
    },
  };
}
