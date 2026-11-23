import { type Connect, NO_CONNECT } from "@originos/connect";
import { type Database, databaseHealthCheck } from "@originos/db";
import { type ChallengeChecker, liveChecker } from "@originos/identity";
import { createHttpService } from "@originos/service-kit";
import { type Storage, scannerHealthCheck, storageHealthCheck } from "@originos/storage";
import type { FastifyInstance } from "fastify";
import type { WorkerEnv } from "./env.js";
import { rewrapTokens } from "./connect/rewrap.js";
import { scheduleDomainRechecks } from "./identity/rechecks.js";
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
  readonly connect?: Connect;
  /** Looks for domain challenges. Defaults to the live, SSRF-safe checker. */
  readonly challengeChecker?: ChallengeChecker;
  /** Schedule daily re-checks of domain proofs (default true with a database). */
  readonly scheduleRechecks?: boolean;
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
  const connect = options.connect ?? NO_CONNECT;
  const checker = options.challengeChecker ?? liveChecker();
  const handlers = options.handlers ?? jobHandlers(storage, connect, checker);
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
  // Rewrap tokens sealed under a retired key: at start, then hourly.
  let rewrapTimer: NodeJS.Timeout | null = null;
  if (database && connect.keyring) {
    const keyring = connect.keyring;
    const sweep = () =>
      void rewrapTokens(database.db, keyring)
        .then((r) => {
          if (r.rewrapped || r.failed) health.log.info(r, "token keys rotated");
        })
        .catch((error: unknown) =>
          health.log.error(
            { err: error instanceof Error ? error.message : "error" },
            "token rewrap failed",
          ),
        );
    sweep();
    rewrapTimer = setInterval(sweep, 3_600_000);
    rewrapTimer.unref();
  } else if (!connect.keyring) {
    health.log.warn("CONNECT_TOKEN_KEYS is not set; provider connections cannot be used.");
  }
  if (checker.kind === "fixture")
    health.log.warn("Domain challenges are answered from a TEST fixture file, not the internet.");
  // Re-check domain proofs that are about to expire: at start, then daily.
  let recheckTimer: NodeJS.Timeout | null = null;
  if (database && options.scheduleRechecks !== false) {
    const recheck = () =>
      void scheduleDomainRechecks(database.db)
        .then((r) => {
          if (r.scheduled) health.log.info(r, "domain proof re-checks scheduled");
        })
        .catch((error: unknown) =>
          health.log.error(
            { err: error instanceof Error ? error.message : "error" },
            "scheduling domain re-checks failed",
          ),
        );
    recheck();
    recheckTimer = setInterval(recheck, 86_400_000);
    recheckTimer.unref();
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
      if (rewrapTimer) clearInterval(rewrapTimer);
      if (recheckTimer) clearInterval(recheckTimer);
      await jobs?.stop();
      await outbox?.stop();
      await health.close();
      await database?.close();
    },
  };
}
