// Durable job contracts (Phase 07, ADR-026). Jobs live in core.jobs and are run
// by apps/worker through the WorkflowRunner interface.

import { z } from "zod";

/**
 * pending: waiting to run (possibly delayed until available_at).
 * running: claimed by a worker under a lease.
 * waiting: paused for a person (approve or reject); resumes as pending.
 * succeeded / cancelled: final.
 * dead: out of attempts or failed permanently; shown for review, can be retried.
 */
export const JOB_STATUSES = [
  "pending",
  "running",
  "waiting",
  "succeeded",
  "cancelled",
  "dead",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const FINAL_JOB_STATUSES: readonly JobStatus[] = ["succeeded", "cancelled"];

/** Dotted lowercase job types, e.g. ingest.scan_upload. */
export const JobType = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);

export const JobView = z.object({
  id: z.string().regex(/^job_[0-9a-hjkmnp-tv-z]{26}$/),
  type: JobType,
  status: z.enum(JOB_STATUSES),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  progress: z.number().int().min(0).max(100),
  progressMessage: z.string().nullable(),
  lastError: z.string().nullable(),
  waitReason: z.string().nullable(),
  cancelRequested: z.boolean(),
  subjectRef: z.string().nullable(),
  availableAt: z.iso.datetime({ offset: true }),
  createdAt: z.iso.datetime({ offset: true }),
  finishedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type JobView = z.infer<typeof JobView>;

export const ResumeDecision = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
});
export type ResumeDecision = z.infer<typeof ResumeDecision>;
