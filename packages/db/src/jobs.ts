// Durable jobs (ADR-026). The API enqueues inside its own scoped transaction;
// the worker claims with SKIP LOCKED under a lease, records completed steps so
// retries never repeat a side effect, and settles the job. Owners and admins
// retry dead jobs, cancel, and resume jobs waiting for a person.
import { JobType, newJobId } from "@originos/contracts";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./client.js";
import { jobSteps, jobs } from "./platform-schema.js";
import type { Tx } from "./scope.js";

export type Job = typeof jobs.$inferSelect;

export interface NewJob {
  readonly tenantId: string;
  readonly type: string;
  /** Ids and settings only: never secrets or private content. */
  readonly payload?: Record<string, unknown>;
  readonly subjectRef?: string | null;
  /** Same tenant, type and key → the existing job is returned instead. */
  readonly idempotencyKey?: string | null;
  readonly maxAttempts?: number;
  readonly runAt?: Date;
  /** null for jobs the system schedules itself (re-checks). */
  readonly createdByUserId: string | null;
  readonly correlationId?: string | null;
  /** Pre-generated id, when the caller must store it before the job exists. */
  readonly id?: string;
}

/**
 * Enqueue in the caller's (scoped) transaction. Returns the job id and whether
 * it was created now. Uses no RETURNING, so it works for members, who can only
 * see jobs they started.
 */
export async function enqueueJob(tx: Tx, job: NewJob): Promise<{ id: string; created: boolean }> {
  const type = JobType.parse(job.type);
  const id = job.id ?? newJobId();
  const result = await tx
    .insert(jobs)
    .values({
      id,
      tenantId: job.tenantId,
      type,
      payload: job.payload ?? {},
      subjectRef: job.subjectRef ?? null,
      idempotencyKey: job.idempotencyKey ?? null,
      maxAttempts: job.maxAttempts ?? 5,
      availableAt: job.runAt ?? new Date(),
      createdByUserId: job.createdByUserId,
      correlationId: job.correlationId ?? null,
    })
    .onConflictDoNothing();
  if ((result.rowCount ?? 0) > 0) return { id, created: true };
  const [existing] = await tx
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.tenantId, job.tenantId),
        eq(jobs.type, type),
        eq(jobs.idempotencyKey, job.idempotencyKey ?? ""),
      ),
    );
  if (!existing) throw new Error("Job was not created and no existing job is visible.");
  return { id: existing.id, created: false };
}

export interface ClaimJobOptions {
  readonly workerId: string;
  readonly limit: number;
  readonly leaseMs: number;
  /** Only claim these types (the ones this worker has handlers for). */
  readonly types: readonly string[];
}

/**
 * Claim due pending jobs, and running jobs whose worker's lease ran out (it
 * crashed). Marks them running and counts the attempt. Commits immediately.
 */
export async function claimJobs(db: Db, options: ClaimJobOptions): Promise<Job[]> {
  if (options.types.length === 0) return [];
  const types = sql.join(
    options.types.map((t) => sql`${t}`),
    sql`, `,
  );
  const result = await db.execute<{ id: string }>(sql`
    update core.jobs j
       set status = 'running',
           locked_by = ${options.workerId},
           locked_until = now() + make_interval(secs => ${options.leaseMs / 1000}),
           attempts = j.attempts + 1,
           updated_at = now()
     where j.id in (
       select id from core.jobs
        where type in (${types})
          and ((status = 'pending' and available_at <= now())
               or (status = 'running' and locked_until < now()))
        order by available_at, id
        limit ${options.limit}
        for update skip locked)
    returning j.id`);
  const ids = result.rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const rows = await db.select().from(jobs).where(inArray(jobs.id, ids));
  return rows.sort((a, b) => (a.id < b.id ? -1 : 1));
}

const held = (jobId: string, workerId: string) =>
  and(eq(jobs.id, jobId), eq(jobs.lockedBy, workerId), eq(jobs.status, "running"));

/** Extend the lease and report progress. Returns false if this worker lost the job. */
export async function heartbeat(
  db: Db,
  jobId: string,
  workerId: string,
  options: {
    readonly leaseMs: number;
    readonly progress?: number;
    readonly message?: string | null;
  },
): Promise<{ held: boolean; cancelRequested: boolean }> {
  const rows = await db
    .update(jobs)
    .set({
      lockedUntil: sql`now() + make_interval(secs => ${options.leaseMs / 1000})`,
      ...(options.progress !== undefined
        ? { progress: Math.max(0, Math.min(100, Math.round(options.progress))) }
        : {}),
      ...(options.message !== undefined ? { progressMessage: options.message } : {}),
    })
    .where(held(jobId, workerId))
    .returning({ cancelRequestedAt: jobs.cancelRequestedAt });
  return { held: rows.length > 0, cancelRequested: rows[0]?.cancelRequestedAt != null };
}

/**
 * Run one named step of a job at most once. The step's own writes (through
 * `tx`) and its completion record commit together. If the step already
 * completed on an earlier attempt, its stored output is returned and `fn` is
 * not called. External side effects inside `fn` must use `${jobId}:${step}`
 * as their idempotency key, because only database writes share the transaction.
 */
export async function runStep<T extends Record<string, unknown>>(
  db: Db,
  jobId: string,
  step: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<{ output: T; ran: boolean }> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(jobSteps)
      .values({ jobId, step })
      .onConflictDoNothing()
      .returning({ step: jobSteps.step });
    if (inserted.length === 0) {
      const [done] = await tx
        .select({ output: jobSteps.output })
        .from(jobSteps)
        .where(and(eq(jobSteps.jobId, jobId), eq(jobSteps.step, step)));
      return { output: (done?.output ?? {}) as T, ran: false };
    }
    const output = await fn(tx);
    await tx
      .update(jobSteps)
      .set({ output })
      .where(and(eq(jobSteps.jobId, jobId), eq(jobSteps.step, step)));
    return { output, ran: true };
  });
}

export async function completedSteps(db: Db, jobId: string): Promise<string[]> {
  const rows = await db
    .select({ step: jobSteps.step })
    .from(jobSteps)
    .where(eq(jobSteps.jobId, jobId));
  return rows.map((r) => r.step);
}

/** Worker: finish successfully. */
export async function succeedJob(
  db: Db,
  jobId: string,
  workerId: string,
  result: Record<string, unknown> = {},
): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({
      status: "succeeded",
      result,
      progress: 100,
      lockedBy: null,
      lockedUntil: null,
      lastError: null,
      finishedAt: new Date(),
    })
    .where(held(jobId, workerId))
    .returning({ id: jobs.id });
  return rows.length > 0;
}

/**
 * Worker: a failed attempt. Retries after `retryInMs` unless the error is
 * permanent or the job is out of attempts, in which case it is dead-lettered
 * for review. The stored error is truncated; callers must not put secrets in it.
 */
export async function failJob(
  db: Db,
  job: Pick<Job, "id" | "attempts" | "maxAttempts">,
  workerId: string,
  error: string,
  options: { readonly retryInMs: number; readonly permanent?: boolean },
): Promise<"retry" | "dead" | "lost"> {
  const dead = options.permanent === true || job.attempts >= job.maxAttempts;
  const rows = await db
    .update(jobs)
    .set({
      status: dead ? "dead" : "pending",
      availableAt: new Date(Date.now() + options.retryInMs),
      lockedBy: null,
      lockedUntil: null,
      lastError: error.slice(0, 500),
      ...(dead ? { finishedAt: new Date() } : {}),
    })
    .where(held(job.id, workerId))
    .returning({ id: jobs.id });
  if (rows.length === 0) return "lost";
  return dead ? "dead" : "retry";
}

/** Worker: pause for a person. The attempt does not count against max attempts. */
export async function waitJob(
  db: Db,
  jobId: string,
  workerId: string,
  reason: string,
): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({
      status: "waiting",
      waitReason: reason.slice(0, 200),
      attempts: sql`greatest(${jobs.attempts} - 1, 0)`,
      lockedBy: null,
      lockedUntil: null,
    })
    .where(held(jobId, workerId))
    .returning({ id: jobs.id });
  return rows.length > 0;
}

/** Worker: stop because a person asked to cancel. */
export async function cancelRunningJob(db: Db, jobId: string, workerId: string): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({ status: "cancelled", lockedBy: null, lockedUntil: null, finishedAt: new Date() })
    .where(held(jobId, workerId))
    .returning({ id: jobs.id });
  return rows.length > 0;
}

export type JobTransitionError = "not_found" | "invalid_state";

/**
 * Owner/admin actions, in the caller's scoped transaction. Row-level security
 * limits them to owners and admins of the job's organization.
 */
export async function requestCancel(
  tx: Tx,
  jobId: string,
  userId: string,
): Promise<
  { ok: true; status: "cancelled" | "cancel_requested" } | { ok: false; error: JobTransitionError }
> {
  const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for("update");
  if (!job) return { ok: false, error: "not_found" };
  if (job.status === "pending" || job.status === "waiting") {
    await tx
      .update(jobs)
      .set({
        status: "cancelled",
        waitReason: null,
        cancelRequestedAt: new Date(),
        cancelRequestedBy: userId,
        finishedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
    return { ok: true, status: "cancelled" };
  }
  if (job.status === "running") {
    await tx
      .update(jobs)
      .set({ cancelRequestedAt: new Date(), cancelRequestedBy: userId })
      .where(eq(jobs.id, jobId));
    return { ok: true, status: "cancel_requested" };
  }
  return { ok: false, error: "invalid_state" };
}

/** Put a dead-lettered job back in the queue with a fresh set of attempts. */
export async function retryDeadJob(
  tx: Tx,
  jobId: string,
): Promise<{ ok: true } | { ok: false; error: JobTransitionError }> {
  const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for("update");
  if (!job) return { ok: false, error: "not_found" };
  if (job.status !== "dead") return { ok: false, error: "invalid_state" };
  await tx
    .update(jobs)
    .set({ status: "pending", attempts: 0, availableAt: new Date(), finishedAt: null })
    .where(eq(jobs.id, jobId));
  return { ok: true };
}

/** Resume a job waiting for a person, with their decision. */
export async function resumeWaitingJob(
  tx: Tx,
  jobId: string,
  input: {
    readonly decision: "approve" | "reject";
    readonly note?: string;
    readonly userId: string;
  },
): Promise<{ ok: true } | { ok: false; error: JobTransitionError }> {
  const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for("update");
  if (!job) return { ok: false, error: "not_found" };
  if (job.status !== "waiting") return { ok: false, error: "invalid_state" };
  await tx
    .update(jobs)
    .set({
      status: "pending",
      waitReason: null,
      availableAt: new Date(),
      resumeInput: {
        decision: input.decision,
        note: input.note ?? null,
        userId: input.userId,
        at: new Date().toISOString(),
      },
    })
    .where(eq(jobs.id, jobId));
  return { ok: true };
}
