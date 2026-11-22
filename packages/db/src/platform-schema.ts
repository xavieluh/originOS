// Ingestion and durable jobs (Phase 07, ADR-026). Plumbing records in `core`,
// not domain objects: an upload becomes evidence only when a later phase links
// its clean copy to a work version (content.artifacts).
import {
  JOB_STATUSES,
  UPLOAD_ERROR_CODES,
  UPLOAD_STATUSES,
  newJobId,
  newUploadId,
} from "@originos/contracts";
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { core, organizations, users } from "./schema.js";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const inList = (column: unknown, values: readonly string[]) =>
  sql`${column} in (${sql.raw(values.map((v) => `'${v}'`).join(", "))})`;

/**
 * One row per uploaded file. The bytes live in object storage under keys the
 * API derives from (tenant, id); clients never choose a key. Only `clean` rows
 * have a files-bucket copy and can be downloaded.
 */
export const uploads = core.table(
  "uploads",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newUploadId()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Display only, sanitized by the API; never used to build a storage key. */
    filename: text("filename").notNull(),
    declaredType: text("declared_type").notNull(),
    /** Type from the file's own bytes (magic numbers), confirmed again by the worker. */
    detectedType: text("detected_type"),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    sha256: text("sha256"),
    status: text("status", { enum: UPLOAD_STATUSES }).notNull().default("quarantined"),
    errorCode: text("error_code", { enum: UPLOAD_ERROR_CODES }),
    errorMessage: text("error_message"),
    quarantineKey: text("quarantine_key").notNull(),
    cleanKey: text("clean_key"),
    scanner: text("scanner"),
    scannedAt: ts("scanned_at"),
    jobId: text("job_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("uploads_id_ck", sql`${t.id} ~ '^upl_[0-9a-hjkmnp-tv-z]{26}$'`),
    check("uploads_status_ck", inList(t.status, UPLOAD_STATUSES)),
    check(
      "uploads_error_code_ck",
      sql`${t.errorCode} is null or ${inList(t.errorCode, UPLOAD_ERROR_CODES)}`,
    ),
    check("uploads_size_ck", sql`${t.byteSize} > 0`),
    check("uploads_sha256_ck", sql`${t.sha256} is null or ${t.sha256} ~ '^[0-9a-f]{64}$'`),
    // Only a clean upload has a servable copy, and a clean upload always has a hash.
    check(
      "uploads_clean_ck",
      sql`(${t.status} = 'clean') = (${t.cleanKey} is not null) and (${t.status} <> 'clean' or ${t.sha256} is not null)`,
    ),
    uniqueIndex("uploads_quarantine_key_uq").on(t.quarantineKey),
    index("uploads_tenant_created_idx").on(t.tenantId, t.createdAt),
  ],
);

/**
 * Durable jobs (ADR-026). Claimed with SKIP LOCKED under a lease like the
 * outbox; retried with backoff; dead-lettered for review; cancellable; can
 * pause for a person (`waiting`) and resume.
 */
export const jobs = core.table(
  "jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newJobId()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    /** Ids and settings only: never secrets or private content. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    /** The record the job works on (an upload id, later a work or run id). */
    subjectRef: text("subject_ref"),
    /** Enqueueing twice with the same key returns the existing job. */
    idempotencyKey: text("idempotency_key"),
    status: text("status", { enum: JOB_STATUSES }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    availableAt: ts("available_at").notNull().defaultNow(),
    lockedBy: text("locked_by"),
    lockedUntil: ts("locked_until"),
    progress: integer("progress").notNull().default(0),
    progressMessage: text("progress_message"),
    lastError: text("last_error"),
    waitReason: text("wait_reason"),
    /** Set when a person resumes a waiting job: { decision, note, userId }. */
    resumeInput: jsonb("resume_input").$type<Record<string, unknown>>(),
    cancelRequestedAt: ts("cancel_requested_at"),
    cancelRequestedBy: uuid("cancel_requested_by").references(() => users.id, {
      onDelete: "set null",
    }),
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    correlationId: text("correlation_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    finishedAt: ts("finished_at"),
  },
  (t) => [
    check("jobs_id_ck", sql`${t.id} ~ '^job_[0-9a-hjkmnp-tv-z]{26}$'`),
    check("jobs_type_ck", sql`${t.type} ~ '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$'`),
    check("jobs_status_ck", inList(t.status, JOB_STATUSES)),
    check("jobs_attempts_ck", sql`${t.attempts} >= 0 and ${t.maxAttempts} between 1 and 50`),
    check("jobs_progress_ck", sql`${t.progress} between 0 and 100`),
    check("jobs_waiting_ck", sql`(${t.status} = 'waiting') = (${t.waitReason} is not null)`),
    uniqueIndex("jobs_idempotency_uq").on(t.tenantId, t.type, t.idempotencyKey),
    index("jobs_ready_idx")
      .on(t.availableAt)
      .where(sql`${t.status} = 'pending'`),
    index("jobs_tenant_created_idx").on(t.tenantId, t.createdAt),
  ],
);

/**
 * Steps a job has completed. A step's own database writes commit in the same
 * transaction as its row here, so a retried job skips steps that already
 * happened: that is what makes "publish" run once even if the job fails later.
 */
export const jobSteps = core.table(
  "job_steps",
  {
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    step: text("step").notNull(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    completedAt: ts("completed_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: "job_steps_pk", columns: [t.jobId, t.step] })],
);
