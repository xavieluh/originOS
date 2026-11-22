// Phase 07 acceptance: durable jobs retry safely without duplicate publishing,
// can be cancelled, wait for people and be dead-lettered and retried; uploads
// are scanned with the real ClamAV and stored in the real S3-compatible store.
import { randomUUID } from "node:crypto";
import { newUploadId } from "@originos/contracts";
import {
  APPLICATION_ROLE,
  WORKER_ROLE,
  claimJobs,
  createDatabase,
  enqueueEvent,
  enqueueJob,
  requestCancel,
  resumeWaitingJob,
  retryDeadJob,
  schema,
  withScope,
} from "@originos/db";
import { sha256Hex, storageFromEnv, uploadKey } from "@originos/storage";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type JobHandler, PermanentJobError, createJobRunner } from "../../src/job-runner.js";
import { SCAN_UPLOAD_JOB, scanUploadHandler } from "../../src/jobs/scan-upload.js";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error("TEST_DATABASE_URL must be set for integration tests (see .env.example).");
const storage = storageFromEnv();
if (!storage.store || !storage.scanner) {
  throw new Error(
    "S3_* and CLAMAV_HOST must be set for worker integration tests (see .env.example).",
  );
}
const store = storage.store;

const owner = createDatabase({ url });
const app = createDatabase({ url, role: APPLICATION_ROLE });
const worker = createDatabase({ url, role: WORKER_ROLE });
const s = schema;
const admin = randomUUID();
const member = randomUUID();
const tenantId = randomUUID();
const asAdmin = { userId: admin, tenantId };
const asMember = { userId: member, tenantId };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

beforeAll(async () => {
  await store.ensureBuckets();
  await owner.db.insert(s.users).values([
    { id: admin, name: "Admin", email: `a-${tenantId}@example.test` },
    { id: member, name: "Member", email: `m-${tenantId}@example.test` },
  ]);
  await owner.db
    .insert(s.organizations)
    .values({ id: tenantId, name: "Jobs", slug: `jobs-${tenantId.slice(0, 8)}`, createdBy: admin });
  await owner.db.insert(s.memberships).values([
    { tenantId, userId: admin, role: "owner" },
    { tenantId, userId: member, role: "member" },
  ]);
});

afterAll(async () => {
  await owner.db.delete(s.organizations).where(eq(s.organizations.id, tenantId));
  await owner.db.delete(s.users).where(eq(s.users.id, admin));
  await owner.db.delete(s.users).where(eq(s.users.id, member));
  await Promise.all([owner.close(), app.close(), worker.close()]);
});

const enqueue = (
  type: string,
  scope = asAdmin,
  extra: { idempotencyKey?: string; maxAttempts?: number } = {},
) =>
  withScope(app.db, scope, (tx) =>
    enqueueJob(tx, { tenantId, type, createdByUserId: scope.userId, ...extra }),
  );
const job = async (id: string) =>
  (await owner.db.select().from(s.jobs).where(eq(s.jobs.id, id)))[0]!;
const events = (causationId: string) =>
  owner.db.select().from(s.outboxEvents).where(eq(s.outboxEvents.causationId, causationId));
const runner = (
  handlers: JobHandler[],
  extra: { leaseMs?: number; retryInMs?: (n: number) => number } = {},
) =>
  createJobRunner({
    db: worker.db,
    handlers,
    workerId: `w-${randomUUID().slice(0, 6)}`,
    retryInMs: () => 0,
    ...extra,
  });

describe("durable jobs", () => {
  it("a job that fails after publishing retries without publishing again", async () => {
    let runs = 0;
    const publisher: JobHandler = {
      type: "test.publish",
      async run(ctx) {
        runs += 1;
        await ctx.step("publish", async (tx) => {
          await enqueueEvent(tx, { tenantId, type: "test.published", causationId: ctx.job.id });
          return { published: true };
        });
        await ctx.progress(60, "after publishing");
        if (runs === 1) throw new Error("downstream timeout after publishing");
        return { done: true };
      },
    };
    const { id } = await enqueue("test.publish");
    const r = runner([publisher]);
    expect(await r.runOnce()).toMatchObject({ claimed: 1, retried: 1 });
    expect((await job(id)).lastError).toMatch(/downstream timeout/);
    expect(await r.runOnce()).toMatchObject({ claimed: 1, succeeded: 1 });
    expect(runs).toBe(2);
    expect(await events(id)).toHaveLength(1);
    expect(await job(id)).toMatchObject({
      status: "succeeded",
      attempts: 2,
      progress: 100,
      result: { done: true },
    });
  });

  it("enqueueing twice with the same idempotency key returns the same job", async () => {
    const a = await enqueue("test.idem", asAdmin, { idempotencyKey: "k1" });
    const b = await enqueue("test.idem", asAdmin, { idempotencyKey: "k1" });
    expect(a.created).toBe(true);
    expect(b).toEqual({ id: a.id, created: false });
  });

  it("a crashed worker's job is picked up again after its lease expires", async () => {
    const { id } = await enqueue("test.crash");
    expect(
      await claimJobs(worker.db, {
        workerId: "dead",
        limit: 5,
        leaseMs: 300,
        types: ["test.crash"],
      }),
    ).toHaveLength(1);
    const r = runner([{ type: "test.crash", run: async () => ({ ok: true }) }]);
    expect((await r.runOnce()).claimed).toBe(0);
    await sleep(400);
    expect(await r.runOnce()).toMatchObject({ claimed: 1, succeeded: 1 });
    expect(await job(id)).toMatchObject({ status: "succeeded", attempts: 2 });
  });

  it("dead-letters after max attempts, and an owner can put it back", async () => {
    let fail = true;
    const flaky: JobHandler = {
      type: "test.flaky",
      run: async () => {
        if (fail) throw new Error("still broken");
      },
    };
    const { id } = await enqueue("test.flaky", asAdmin, { maxAttempts: 2 });
    const r = runner([flaky]);
    expect(await r.runOnce()).toMatchObject({ retried: 1 });
    expect(await r.runOnce()).toMatchObject({ dead: 1 });
    expect(await job(id)).toMatchObject({
      status: "dead",
      attempts: 2,
      lastError: "Error: still broken",
    });
    // A member cannot retry it (row-level security hides it from them for updates).
    expect(await withScope(app.db, asMember, (tx) => retryDeadJob(tx, id))).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await withScope(app.db, asAdmin, (tx) => retryDeadJob(tx, id))).toEqual({ ok: true });
    fail = false;
    expect(await r.runOnce()).toMatchObject({ succeeded: 1 });
  });

  it("a permanent error dead-letters at once", async () => {
    const { id } = await enqueue("test.permanent");
    const r = runner([
      { type: "test.permanent", run: () => Promise.reject(new PermanentJobError("bad input")) },
    ]);
    expect(await r.runOnce()).toMatchObject({ dead: 1 });
    expect(await job(id)).toMatchObject({ status: "dead", attempts: 1 });
  });

  it("cancels a pending job at once and a running job at its next progress report", async () => {
    const pending = await enqueue("test.cancel_pending");
    expect(await withScope(app.db, asAdmin, (tx) => requestCancel(tx, pending.id, admin))).toEqual({
      ok: true,
      status: "cancelled",
    });
    expect((await job(pending.id)).status).toBe("cancelled");

    const running = await enqueue("test.cancel_running");
    let steps = 0;
    const slow: JobHandler = {
      type: "test.cancel_running",
      async run(ctx) {
        for (let i = 1; i <= 5; i++) {
          steps = i;
          if (i === 2)
            await withScope(app.db, asAdmin, (tx) => requestCancel(tx, running.id, admin));
          await ctx.progress(i * 20);
        }
      },
    };
    expect(await runner([slow]).runOnce()).toMatchObject({ cancelled: 1 });
    expect(steps).toBe(2);
    expect(await job(running.id)).toMatchObject({ status: "cancelled", cancelRequestedBy: admin });
  });

  it("waits for a person and resumes with their decision", async () => {
    const decisions: string[] = [];
    const approval: JobHandler = {
      type: "test.approval",
      async run(ctx) {
        if (!ctx.resumeInput) ctx.waitForPerson("Approve publishing this test item");
        decisions.push(ctx.resumeInput!.decision);
        return { decision: ctx.resumeInput!.decision };
      },
    };
    const { id } = await enqueue("test.approval");
    const r = runner([approval]);
    expect(await r.runOnce()).toMatchObject({ waiting: 1 });
    expect(await job(id)).toMatchObject({
      status: "waiting",
      waitReason: "Approve publishing this test item",
      attempts: 0,
    });
    expect((await r.runOnce()).claimed).toBe(0); // waiting jobs are not claimed
    expect(
      await withScope(app.db, asMember, (tx) =>
        resumeWaitingJob(tx, id, { decision: "approve", userId: member }),
      ),
    ).toEqual({ ok: false, error: "not_found" });
    expect(
      await withScope(app.db, asAdmin, (tx) =>
        resumeWaitingJob(tx, id, { decision: "approve", userId: admin }),
      ),
    ).toEqual({ ok: true });
    expect(await r.runOnce()).toMatchObject({ succeeded: 1 });
    expect(decisions).toEqual(["approve"]);
    expect(await job(id)).toMatchObject({
      status: "succeeded",
      attempts: 1,
      result: { decision: "approve" },
    });
  });

  it("members see only jobs they started; owners see all", async () => {
    const mine = await enqueue("test.visibility", asMember);
    const theirs = await enqueue("test.visibility", asAdmin);
    const seen = await withScope(app.db, asMember, (tx) =>
      tx.select({ id: s.jobs.id }).from(s.jobs).where(eq(s.jobs.type, "test.visibility")),
    );
    expect(seen.map((j) => j.id)).toEqual([mine.id]);
    const all = await withScope(app.db, asAdmin, (tx) =>
      tx.select({ id: s.jobs.id }).from(s.jobs).where(eq(s.jobs.type, "test.visibility")),
    );
    expect(all.map((j) => j.id).sort()).toEqual([mine.id, theirs.id].sort());
  });
});

describe("upload scanning (real S3 store and ClamAV)", () => {
  // The API integration tests share this database and leave scan jobs queued
  // (no worker runs there). Settle them so these counts only see this suite's jobs.
  beforeAll(async () => {
    await owner.db
      .update(s.jobs)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(and(eq(s.jobs.type, SCAN_UPLOAD_JOB), inArray(s.jobs.status, ["pending", "running"])));
  });

  /** What the API does: store in quarantine, record the upload and enqueue its scan. */
  async function upload(filename: string, declaredType: string, body: string | Uint8Array) {
    const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
    const id = newUploadId();
    const key = uploadKey(tenantId, id);
    await store.put("quarantine", key, bytes, declaredType);
    const jobId = await withScope(app.db, asMember, async (tx) => {
      const { id: jid } = await enqueueJob(tx, {
        tenantId,
        type: SCAN_UPLOAD_JOB,
        payload: { uploadId: id },
        subjectRef: id,
        idempotencyKey: id,
        createdByUserId: member,
      });
      await tx.insert(s.uploads).values({
        id,
        tenantId,
        uploadedByUserId: member,
        filename,
        declaredType,
        byteSize: bytes.length,
        sha256: sha256Hex(bytes),
        quarantineKey: key,
        jobId: jid,
      });
      return jid;
    });
    return { id, key, jobId };
  }
  const row = async (id: string) =>
    (await owner.db.select().from(s.uploads).where(eq(s.uploads.id, id)))[0]!;
  const scanRunner = (scanner = storage.scanner) =>
    runner([scanUploadHandler({ store, scanner, maxUploadBytes: storage.maxUploadBytes })]);

  it("a clean file is released to the files bucket once", async () => {
    const u = await upload("notes.md", "text/markdown", "# Notes\n\nNothing dangerous here.\n");
    expect(await scanRunner().runOnce()).toMatchObject({ succeeded: 1 });
    expect(await row(u.id)).toMatchObject({
      status: "clean",
      detectedType: "text/markdown",
      cleanKey: u.key,
      scanner: "clamav",
    });
    expect(await store.exists("files", u.key)).toBe(true);
    const published = await events(u.jobId);
    expect(published.map((e) => e.type)).toEqual(["upload.cleaned"]);
  });

  it("a malicious file is rejected and stays in quarantine", async () => {
    const u = await upload("eicar.txt", "text/plain", EICAR);
    expect(await scanRunner().runOnce()).toMatchObject({ succeeded: 1 });
    const r = await row(u.id);
    expect(r).toMatchObject({ status: "rejected", errorCode: "malware_detected", cleanKey: null });
    expect(r.errorMessage).toMatch(/Eicar-Test-Signature/);
    expect(await store.exists("quarantine", u.key)).toBe(true);
    expect(await store.exists("files", u.key)).toBe(false);
    expect((await events(u.jobId)).map((e) => e.type)).toEqual(["upload.rejected"]);
  });

  it("a file whose bytes do not match its declared type is rejected", async () => {
    const u = await upload("photo.png", "image/png", "this is not a PNG");
    await scanRunner().runOnce();
    expect(await row(u.id)).toMatchObject({ status: "rejected", errorCode: "type_mismatch" });
    expect(await store.exists("files", u.key)).toBe(false);
  });

  it("without a scanner the file stays quarantined; after setup an owner's retry releases it", async () => {
    const u = await upload("later.txt", "text/plain", "scan me when you can");
    expect(await scanRunner(null).runOnce()).toMatchObject({ dead: 1 });
    expect(await row(u.id)).toMatchObject({
      status: "scan_unavailable",
      errorCode: "scanner_unavailable",
    });
    expect(await store.exists("files", u.key)).toBe(false);
    expect(await withScope(app.db, asAdmin, (tx) => retryDeadJob(tx, u.jobId))).toEqual({
      ok: true,
    });
    expect(await scanRunner().runOnce()).toMatchObject({ succeeded: 1 });
    expect(await row(u.id)).toMatchObject({ status: "clean", errorCode: null });
  });

  it("a scanner outage is retried, not treated as clean", async () => {
    const u = await upload("outage.txt", "text/plain", "try again");
    const down = {
      name: "clamav",
      ping: async () => false,
      scan: async () => {
        throw new (await import("@originos/storage")).ScannerUnavailable("down");
      },
    };
    expect(await scanRunner(down).runOnce()).toMatchObject({ retried: 1 });
    expect(await row(u.id)).toMatchObject({ status: "scan_unavailable" });
    expect((await job(u.jobId)).status).toBe("pending");
    expect(await scanRunner().runOnce()).toMatchObject({ succeeded: 1 });
    expect(await row(u.id)).toMatchObject({ status: "clean" });
    const types = await owner.db
      .select({ t: s.outboxEvents.type })
      .from(s.outboxEvents)
      .where(and(eq(s.outboxEvents.causationId, u.jobId)));
    expect(types).toHaveLength(1);
  });
});
