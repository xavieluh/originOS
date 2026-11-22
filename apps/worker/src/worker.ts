import { type Database, databaseHealthCheck } from "@originos/db";
import { createHttpService } from "@originos/service-kit";
import { type Storage, scannerHealthCheck, storageHealthCheck } from "@originos/storage";
import type { FastifyInstance } from "fastify";
import type { WorkerEnv } from "./env.js";
import { jobHandlers, registeredConsumers } from "./handlers.js";
import { type JobHandler, type JobRunner, createJobRunner } from "./job-runner.js";
import {
  type OutboxConsumer,
  type OutboxDispatcher,
  createOutboxDispatcher,
} from "./outbox-dispatcher.js";

export const VERSION = process.env.ORIGINOS_VERSION ?? "0.0.0-dev";

export interface Worker {
  readonly health: FastifyInstance;
  /** Null without a database. */
  readonly jobs: JobRunner | null;
  /** Null without a database. */
  readonly outbox: OutboxDispatcher | null;
  stop(): Promise<void>;
}

export interface WorkerOptions {
  readonly storage?: Storage;
  readonly handlers?: readonly JobHandler[];
  readonly consumers?: readonly OutboxConsumer[];
  readonly workerId?: string;
}

const NO_STORAGE: Storage = { store: null, scanner: null, maxUploadBytes: 0 };

export function createWorker(
  env: Pick<WorkerEnv, "LOG_LEVEL">,
  database: Database | null,
  options: WorkerOptions = {},
): Worker {
  const storage = options.storage ?? NO_STORAGE;
  const handlers = options.handlers ?? jobHandlers(storage);
  const consumers = options.consumers ?? registeredConsumers;
  const workerId = options.workerId ?? `worker-${process.pid}-${Date.now().toString(36)}`;
  const health = createHttpService({
    service: "worker",
    version: VERSION,
    logLevel: env.LOG_LEVEL,
    readinessChecks: {
      database: () => databaseHealthCheck(database),
      objectStorage: () => storageHealthCheck(storage.store),
      malwareScanner: () => scannerHealthCheck(storage.scanner),
    },
  });

  const jobs = database
    ? createJobRunner({ db: database.db, handlers, workerId, log: health.log })
    : null;
  const outbox = database
    ? createOutboxDispatcher({ db: database.db, consumers, workerId, log: health.log })
    : null;
  if (!storage.store)
    health.log.warn("Object storage is not configured; uploads cannot be processed.");
  if (!storage.scanner) {
    health.log.warn("No malware scanner is configured; uploads stay in quarantine.");
  }
  if (consumers.length === 0) {
    health.log.warn(
      "No outbox consumers are registered; events stay pending until a module registers one.",
    );
  }

  return {
    health,
    jobs,
    outbox,
    async stop() {
      await jobs?.stop();
      await outbox?.stop();
      await health.close();
      await database?.close();
    },
  };
}
