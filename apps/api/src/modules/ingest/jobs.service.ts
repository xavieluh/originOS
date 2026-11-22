import { Inject, Injectable } from "@nestjs/common";
import type { JobStatus, JobView } from "@originos/contracts";
import {
  type Db,
  type JobTransitionError,
  type Tx,
  requestCancel,
  resumeWaitingJob,
  retryDeadJob,
  schema,
  withScope,
} from "@originos/db";
import { and, desc, eq } from "drizzle-orm";
import {
  APP_DB,
  type Principal,
  type TenantContext,
  conflict,
  notFound,
  recordAudit,
} from "../core/index.js";

const { jobs } = schema;
type JobRow = typeof jobs.$inferSelect;

export function toJobView(row: JobRow): JobView {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    progress: row.progress,
    progressMessage: row.progressMessage,
    lastError: row.lastError,
    waitReason: row.waitReason,
    cancelRequested: row.cancelRequestedAt !== null,
    subjectRef: row.subjectRef,
    availableAt: row.availableAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

const failure = (error: JobTransitionError, verb: string) =>
  error === "not_found"
    ? notFound("No such job in this organization.")
    : conflict("invalid_job_state", `This job cannot be ${verb} in its current state.`);

/** Owners and admins: the job admin page (dead-letter review, cancel, human waits). */
@Injectable()
export class JobsService {
  constructor(@Inject(APP_DB) private readonly db: Db | null) {}

  private get database(): Db {
    if (!this.db) throw new Error("JobsService used without a database");
    return this.db;
  }

  async list(p: Principal, t: TenantContext, status?: JobStatus): Promise<JobView[]> {
    const rows = await withScope(this.database, { userId: p.userId, tenantId: t.tenantId }, (tx) =>
      tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.tenantId, t.tenantId), status ? eq(jobs.status, status) : undefined))
        .orderBy(desc(jobs.createdAt))
        .limit(200),
    );
    return rows.map(toJobView);
  }

  private async act(
    p: Principal,
    t: TenantContext,
    id: string,
    action: string,
    verb: string,
    fn: (tx: Tx) => Promise<{ ok: true } | { ok: false; error: JobTransitionError }>,
    correlationId: string,
    metadata: Record<string, string | null> = {},
  ): Promise<JobView> {
    return withScope(this.database, { userId: p.userId, tenantId: t.tenantId }, async (tx) => {
      const result = await fn(tx);
      if (!result.ok) throw failure(result.error, verb);
      await recordAudit(tx, {
        tenantId: t.tenantId,
        actorUserId: p.userId,
        action,
        targetType: "job",
        targetId: id,
        metadata,
        correlationId,
      });
      const [row] = await tx.select().from(jobs).where(eq(jobs.id, id));
      return toJobView(row!);
    });
  }

  retry(p: Principal, t: TenantContext, id: string, correlationId: string) {
    return this.act(
      p,
      t,
      id,
      "job.retried",
      "retried",
      (tx) => retryDeadJob(tx, id),
      correlationId,
    );
  }

  cancel(p: Principal, t: TenantContext, id: string, correlationId: string) {
    return this.act(
      p,
      t,
      id,
      "job.cancel_requested",
      "cancelled",
      (tx) => requestCancel(tx, id, p.userId),
      correlationId,
    );
  }

  resume(
    p: Principal,
    t: TenantContext,
    id: string,
    input: { decision: "approve" | "reject"; note?: string | undefined },
    correlationId: string,
  ) {
    return this.act(
      p,
      t,
      id,
      "job.resumed",
      "resumed",
      (tx) =>
        resumeWaitingJob(tx, id, {
          decision: input.decision,
          userId: p.userId,
          ...(input.note ? { note: input.note } : {}),
        }),
      correlationId,
      { decision: input.decision },
    );
  }
}
