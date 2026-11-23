// Re-check verified domain proofs before their badge expires (Phase 09). Runs
// daily from the worker; each proof gets at most one scheduled re-check per
// day (idempotency key). A failed re-check makes the proof stale.
import { IDENTITY_CHECK_DOMAIN_JOB } from "@originos/contracts";
import { type Db, enqueueJob, schema } from "@originos/db";
import { and, eq, lt } from "drizzle-orm";

const { identityProofs: proofs } = schema;

/** Re-check proofs whose badge expires within this many days. */
export const RECHECK_WINDOW_DAYS = 14;

export async function scheduleDomainRechecks(
  db: Db,
  now: Date = new Date(),
  limit = 500,
): Promise<{ scheduled: number }> {
  const horizon = new Date(now.getTime() + RECHECK_WINDOW_DAYS * 86_400_000);
  const due = await db
    .select({ id: proofs.id, tenantId: proofs.tenantId })
    .from(proofs)
    .where(
      and(eq(proofs.kind, "domain"), eq(proofs.status, "verified"), lt(proofs.expiresAt, horizon)),
    )
    .limit(limit);
  const day = now.toISOString().slice(0, 10);
  let scheduled = 0;
  for (const p of due) {
    const job = await db.transaction((tx) =>
      enqueueJob(tx, {
        tenantId: p.tenantId,
        type: IDENTITY_CHECK_DOMAIN_JOB,
        payload: { proofId: p.id },
        subjectRef: p.id,
        idempotencyKey: `recheck:${p.id}:${day}`,
        maxAttempts: 3,
        createdByUserId: null,
      }),
    );
    if (job.created) scheduled++;
  }
  return { scheduled };
}
