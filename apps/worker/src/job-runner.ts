// Durable job runner (ADR-026): the WorkflowRunner implementation on Postgres.
// Claims due jobs under a lease, runs the registered handler with a context
// for steps, progress, cancellation and human waits, then settles the job.
//
// Temporal migration contract: a handler is a sequence of named steps
// (`ctx.step`), each idempotent and retried as a unit, with deterministic code
// between them; waits for people are `ctx.waitForPerson`. Those map one to one
// onto Temporal activities and signals, so handlers can move without rewriting
// their logic. Nothing outside this file and packages/db/src/jobs.ts knows how
// jobs are stored.
import {
  type Db,
  type Job,
  type Tx,
  backoffMs,
  cancelRunningJob,
  claimJobs,
  failJob,
  heartbeat,
  runStep,
  succeedJob,
  waitJob,
} from "@originos/db";

export interface JobContext {
  readonly job: Job;
  /** The worker's database (worker role: jobs, uploads and outbox only). */
  readonly db: Db;
  /**
   * Run a named step at most once across attempts. Its database writes commit
   * with its completion record; external calls inside must use
   * `${job.id}:${name}` as their idempotency key.
   */
  step<T extends Record<string, unknown>>(name: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Report progress (0–100) and extend the lease. Throws JobCancelled if a person cancelled. */
  progress(percent: number, message?: string): Promise<void>;
  /** The decision of the person who resumed this job, if it waited. */
  readonly resumeInput: {
    readonly decision: "approve" | "reject";
    readonly note: string | null;
  } | null;
  /** Pause until a person approves or rejects (owners and admins, on the jobs page). */
  waitForPerson(reason: string): never;
}

export interface JobHandler {
  readonly type: string;
  run(ctx: JobContext): Promise<Record<string, unknown> | void>;
}

/** Fails the job without retrying (it goes to dead-letter review). */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

export class JobCancelled extends Error {
  constructor() {
    super("Cancelled by a person.");
    this.name = "JobCancelled";
  }
}

class WaitForPerson extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "WaitForPerson";
  }
}

export interface RunnerLog {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export interface RunnerOptions {
  readonly db: Db;
  readonly handlers: readonly JobHandler[];
  readonly workerId: string;
  readonly batchSize?: number;
  readonly leaseMs?: number;
  readonly retryInMs?: (attempts: number) => number;
  readonly log?: RunnerLog;
}

export interface RunResult {
  readonly claimed: number;
  readonly succeeded: number;
  readonly retried: number;
  readonly dead: number;
  readonly waiting: number;
  readonly cancelled: number;
  readonly lost: number;
}

export interface JobRunner {
  readonly handlers: readonly JobHandler[];
  runOnce(): Promise<RunResult>;
  start(intervalMs: number): void;
  stop(): Promise<void>;
}

const silent: RunnerLog = { info: () => undefined, warn: () => undefined, error: () => undefined };

function reason(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : "non-error thrown";
}

export function createJobRunner(options: RunnerOptions): JobRunner {
  const byType = new Map<string, JobHandler>();
  for (const h of options.handlers) {
    if (byType.has(h.type)) throw new Error(`Duplicate job handler: ${h.type}`);
    byType.set(h.type, h);
  }
  const log = options.log ?? silent;
  const leaseMs = options.leaseMs ?? 120_000;
  const retryInMs = options.retryInMs ?? ((n: number) => backoffMs(n, 2_000, 600_000));
  let timer: NodeJS.Timeout | null = null;
  let inFlight: Promise<unknown> = Promise.resolve();

  async function runJob(job: Job): Promise<keyof Omit<RunResult, "claimed">> {
    const handler = byType.get(job.type)!;
    const fields = { jobId: job.id, type: job.type, attempt: job.attempts };
    if (job.cancelRequestedAt) {
      return (await cancelRunningJob(options.db, job.id, options.workerId)) ? "cancelled" : "lost";
    }
    // Keep the lease alive while the handler works between progress reports.
    const beat = setInterval(
      () => {
        void heartbeat(options.db, job.id, options.workerId, { leaseMs }).catch(() => undefined);
      },
      Math.max(1_000, Math.floor(leaseMs / 3)),
    );
    const input = job.resumeInput as { decision?: string; note?: string | null } | null;
    const ctx: JobContext = {
      job,
      db: options.db,
      step: async (name, fn) => (await runStep(options.db, job.id, name, fn)).output,
      async progress(percent, message) {
        const state = await heartbeat(options.db, job.id, options.workerId, {
          leaseMs,
          progress: percent,
          message: message ?? null,
        });
        if (state.cancelRequested) throw new JobCancelled();
      },
      resumeInput:
        input && (input.decision === "approve" || input.decision === "reject")
          ? { decision: input.decision, note: input.note ?? null }
          : null,
      waitForPerson(why) {
        throw new WaitForPerson(why);
      },
    };
    try {
      const result = (await handler.run(ctx)) ?? {};
      if (await succeedJob(options.db, job.id, options.workerId, result)) return "succeeded";
      log.warn(fields, "job lease lost before completion; another worker will settle it");
      return "lost";
    } catch (error) {
      if (error instanceof WaitForPerson) {
        await waitJob(options.db, job.id, options.workerId, error.reason);
        log.info(fields, "job waiting for a person");
        return "waiting";
      }
      if (error instanceof JobCancelled) {
        await cancelRunningJob(options.db, job.id, options.workerId);
        log.info(fields, "job cancelled");
        return "cancelled";
      }
      const outcome = await failJob(options.db, job, options.workerId, reason(error), {
        retryInMs: retryInMs(job.attempts),
        permanent: error instanceof PermanentJobError,
      });
      if (outcome === "dead") log.error({ ...fields, err: reason(error) }, "job dead-lettered");
      else if (outcome === "retry")
        log.warn({ ...fields, err: reason(error) }, "job failed; will retry");
      return outcome === "dead" ? "dead" : outcome === "retry" ? "retried" : "lost";
    } finally {
      clearInterval(beat);
    }
  }

  async function runOnce(): Promise<RunResult> {
    const result = {
      claimed: 0,
      succeeded: 0,
      retried: 0,
      dead: 0,
      waiting: 0,
      cancelled: 0,
      lost: 0,
    };
    const claimed = await claimJobs(options.db, {
      workerId: options.workerId,
      limit: options.batchSize ?? 5,
      leaseMs,
      types: [...byType.keys()],
    });
    result.claimed = claimed.length;
    for (const job of claimed) result[await runJob(job)] += 1;
    return result;
  }

  return {
    handlers: options.handlers,
    runOnce,
    start(intervalMs) {
      if (timer || byType.size === 0) return;
      const tick = () => {
        inFlight = runOnce()
          .catch((error: unknown) => log.error({ err: reason(error) }, "job polling failed"))
          .finally(() => {
            if (timer) timer = setTimeout(tick, intervalMs);
          });
      };
      timer = setTimeout(tick, 0);
    },
    async stop() {
      if (timer) clearTimeout(timer);
      timer = null;
      await inFlight;
    },
  };
}
