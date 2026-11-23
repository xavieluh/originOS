// IdentityMesh job (Phase 09): look for a domain challenge and record the
// result through trust.record_domain_check(), the only path that can verify a
// domain proof. Lookups are SSRF-safe (@originos/identity liveChecker); a
// transient failure retries, a definite one is recorded for the person.
import { IDENTITY_CHECK_DOMAIN_JOB, newEventId, newId } from "@originos/contracts";
import { schema } from "@originos/db";
import { type ChallengeChecker, MECHANISMS } from "@originos/identity";
import { eq, sql } from "drizzle-orm";
import { type JobHandler, PermanentJobError } from "../job-runner.js";

const { identityProofs: proofs } = schema;

/** Retried by the runner; the lookup may pass next time. */
export class TransientLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientLookupError";
  }
}

export function identityCheckDomainHandler(checker: ChallengeChecker): JobHandler {
  return {
    type: IDENTITY_CHECK_DOMAIN_JOB,
    async run(ctx) {
      const proofId = ctx.job.payload.proofId;
      if (typeof proofId !== "string" || !/^prv_[0-9a-hjkmnp-tv-z]{26}$/.test(proofId))
        throw new PermanentJobError("The job has no valid proof id.");
      const [proof] = await ctx.db
        .select({
          tenantId: proofs.tenantId,
          kind: proofs.kind,
          method: proofs.method,
          target: proofs.target,
          challenge: proofs.challenge,
          status: proofs.status,
        })
        .from(proofs)
        .where(eq(proofs.id, proofId));
      if (!proof || proof.tenantId !== ctx.job.tenantId)
        throw new PermanentJobError("The proof this job refers to does not exist.");
      if (proof.kind !== "domain" || !proof.challenge)
        throw new PermanentJobError("Only domain proofs are checked by this job.");
      if (proof.status === "revoked") return { proofId, status: "revoked" };
      const method = proof.method as "dns_txt" | "html_file";

      const result = await checker.check(proof.target, method, proof.challenge);
      if (!result.ok && result.transient && ctx.job.attempts < ctx.job.maxAttempts)
        throw new TransientLookupError(result.detail);

      // Recorded once even if the job is retried after this point.
      return ctx.step("record", async (tx) => {
        const recorded = await tx.execute<{ status: string }>(
          sql`select trust.record_domain_check(${proofId}, ${result.ok}, ${MECHANISMS[method]},
            ${result.ok ? null : result.detail}, ${newId("identity_claim")}, ${newEventId()},
            ${ctx.job.correlationId}) as status`,
        );
        return { proofId, status: recorded.rows[0]?.status ?? "unknown", passed: result.ok };
      });
    },
  };
}
