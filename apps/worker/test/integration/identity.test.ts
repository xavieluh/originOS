// Phase 09 acceptance (worker side): a domain proof is verified only when the
// challenge is actually found; definite failures are recorded for the person,
// lookups that may pass later are retried, a failed re-check makes a verified
// proof stale, revoked proofs are left alone, and re-checks are scheduled
// before badges expire. Uses the test-only fixture checker and a real PostgreSQL.
import { randomUUID } from "node:crypto";
import { newId, newProofId } from "@originos/contracts";
import { WORKER_ROLE, createDatabase, enqueueJob, schema } from "@originos/db";
import { dnsRecordName, newChallenge } from "@originos/identity";
import { fixtureChecker } from "@originos/identity/testing";
import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RECHECK_WINDOW_DAYS, scheduleDomainRechecks } from "../../src/identity/rechecks.js";
import { createJobRunner } from "../../src/job-runner.js";
import { identityCheckDomainHandler } from "../../src/jobs/identity.js";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error("TEST_DATABASE_URL must be set for integration tests (see .env.example).");

const owner = createDatabase({ url });
const worker = createDatabase({ url, role: WORKER_ROLE });
const { jobs, identityProofs: proofs } = schema;
const user = randomUUID();
const tenantId = randomUUID();
const subjectId = newId("subject");
const profileId = `prf_${newId("subject").slice(4)}`;
const checker = fixtureChecker();

beforeAll(async () => {
  await owner.db
    .insert(schema.users)
    .values({ id: user, name: "Creator", email: `i-${tenantId}@example.test` });
  await owner.db.insert(schema.organizations).values({
    id: tenantId,
    name: "Identity",
    slug: `identity-${tenantId.slice(0, 8)}`,
    createdBy: user,
  });
  await owner.db.insert(schema.memberships).values({ tenantId, userId: user, role: "owner" });
  await owner.db
    .insert(schema.subjects)
    .values({ id: subjectId, tenantId, kind: "human", displayName: "Quill", userId: user });
  await owner.db.insert(schema.profiles).values({
    id: profileId,
    tenantId,
    subjectId,
    kind: "creator",
    handle: `wk-${tenantId.slice(0, 8)}`,
    displayName: "Quill",
    createdByUserId: user,
  });
  // API tests leave check jobs for their own proofs.
  await owner.db
    .update(jobs)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(and(like(jobs.type, "identity.%"), eq(jobs.status, "pending")));
});
afterAll(async () => {
  await owner.db.delete(schema.organizations).where(eq(schema.organizations.id, tenantId));
  await owner.db.delete(schema.users).where(eq(schema.users.id, user));
  await Promise.all([owner.close(), worker.close()]);
});

async function pendingProof(domain: string, method: "dns_txt" | "html_file" = "dns_txt") {
  const id = newProofId();
  const challenge = newChallenge();
  await owner.db.insert(proofs).values({
    id,
    tenantId,
    profileId,
    kind: "domain",
    method,
    target: domain,
    label: domain,
    challenge,
    createdByUserId: user,
  });
  return { id, challenge };
}

const enqueue = (proofId: string, key = randomUUID()) =>
  owner.db.transaction((tx) =>
    enqueueJob(tx, {
      tenantId,
      type: "identity.check_domain",
      payload: { proofId },
      idempotencyKey: key,
      maxAttempts: 2,
      createdByUserId: user,
    }),
  );
const runner = () =>
  createJobRunner({
    db: worker.db,
    handlers: [identityCheckDomainHandler(checker)],
    workerId: `w-${randomUUID().slice(0, 6)}`,
    retryInMs: () => 0,
  });
const proof = async (id: string) =>
  (await owner.db.select().from(proofs).where(eq(proofs.id, id)))[0]!;

describe("domain challenge checks", () => {
  it("stays pending with the reason when the record is missing, verifies once it is published", async () => {
    const { id, challenge } = await pendingProof("found.example.com");
    await enqueue(id);
    expect(await runner().runOnce()).toMatchObject({ succeeded: 1 });
    expect(await proof(id)).toMatchObject({
      status: "pending",
      lastCheckError: "No TXT record was found at _originos-challenge.found.example.com.",
      checkCount: 1,
    });

    // A near miss (wrong value) is not a pass.
    checker.fixtures.dns = { [dnsRecordName("found.example.com")]: [`${challenge}0`] };
    await enqueue(id);
    await runner().runOnce();
    expect((await proof(id)).status).toBe("pending");

    checker.fixtures.dns = { [dnsRecordName("found.example.com")]: ["v=spf1 -all", challenge] };
    await enqueue(id);
    expect(await runner().runOnce()).toMatchObject({ succeeded: 1 });
    const row = await proof(id);
    expect(row).toMatchObject({ status: "verified", lastCheckError: null, checkCount: 3 });
    expect(row.expiresAt!.getTime() - row.lastVerifiedAt!.getTime()).toBe(90 * 86_400_000);
    const [claim] = await owner.db
      .select()
      .from(schema.identityClaims)
      .where(eq(schema.identityClaims.id, row.claimId!));
    expect(claim).toMatchObject({
      subjectId,
      captureMethod: "challenge",
      validationMechanism: "dns_txt_record",
      assurance: "domain_or_account_controlled",
      sourceProvider: "dns",
      value: "found.example.com",
    });
    const events = await owner.db
      .select({ type: schema.outboxEvents.type })
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.subjectRef, id));
    expect(events).toEqual([{ type: "identity.proof_verified" }]);
  });

  it("retries a lookup that may pass later, then records it as failed", async () => {
    const { id } = await pendingProof("flaky.example.com", "html_file");
    checker.fixtures.unreachable = ["flaky.example.com"];
    const { id: jobId } = await enqueue(id);
    const r = runner();
    expect(await r.runOnce()).toMatchObject({ retried: 1 });
    expect((await proof(id)).checkCount).toBe(0);
    expect(await r.runOnce()).toMatchObject({ succeeded: 1 });
    expect(await proof(id)).toMatchObject({ status: "pending", checkCount: 1 });
    expect((await owner.db.select().from(jobs).where(eq(jobs.id, jobId)))[0]!.result).toMatchObject(
      {
        passed: false,
      },
    );
    checker.fixtures.unreachable = [];
  });

  it("a failed re-check makes a verified proof stale; a revoked proof is left alone", async () => {
    const { id, challenge } = await pendingProof("recheck.example.com", "html_file");
    checker.fixtures.html = { "recheck.example.com": `${challenge}\n` };
    await enqueue(id);
    await runner().runOnce();
    const first = await proof(id);
    expect(first.status).toBe("verified");

    checker.fixtures.html = {};
    await enqueue(id);
    await runner().runOnce();
    const stale = await proof(id);
    expect(stale.status).toBe("stale");
    expect(stale.staleReason).toMatch(
      /^The re-check on \d{4}-\d{2}-\d{2} failed: The file URL answered HTTP 404\.$/,
    );
    // The earlier claim still says what was true then; it is not rewritten.
    expect(stale.claimId).toBe(first.claimId);

    await owner.db
      .update(proofs)
      .set({ status: "revoked", revokedAt: new Date(), revokedReason: "withdrawn" })
      .where(eq(proofs.id, id));
    checker.fixtures.html = { "recheck.example.com": challenge };
    const { id: jobId } = await enqueue(id);
    await runner().runOnce();
    expect((await proof(id)).status).toBe("revoked");
    expect((await owner.db.select().from(jobs).where(eq(jobs.id, jobId)))[0]!.result).toMatchObject(
      {
        status: "revoked",
      },
    );
  });

  it("the worker role cannot verify a proof directly; only through the recording function", async () => {
    const { id } = await pendingProof("direct.example.com");
    await expect(
      worker.db.update(proofs).set({ status: "verified" }).where(eq(proofs.id, id)),
    ).rejects.toThrow();
  });
});

describe("scheduled re-checks", () => {
  it("queues one re-check a day for verified domain proofs close to expiry", async () => {
    const { id, challenge } = await pendingProof("soon.example.com");
    checker.fixtures.dns = { [dnsRecordName("soon.example.com")]: [challenge] };
    await enqueue(id);
    await runner().runOnce();
    const later = new Date(Date.now() + (90 - RECHECK_WINDOW_DAYS + 1) * 86_400_000);
    expect((await scheduleDomainRechecks(worker.db, new Date())).scheduled).toBe(0);
    const first = await scheduleDomainRechecks(worker.db, later);
    expect(first.scheduled).toBeGreaterThanOrEqual(1);
    expect((await scheduleDomainRechecks(worker.db, later)).scheduled).toBe(0);
    const queued = await owner.db
      .select({ key: jobs.idempotencyKey, by: jobs.createdByUserId })
      .from(jobs)
      .where(and(eq(jobs.tenantId, tenantId), like(jobs.idempotencyKey, `recheck:${id}:%`)));
    expect(queued).toEqual([
      { key: `recheck:${id}:${later.toISOString().slice(0, 10)}`, by: null },
    ]);
  });
});
