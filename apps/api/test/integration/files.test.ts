// Phase 07 acceptance through the real HTTP stack, PostgreSQL with row-level
// security and real S3-compatible storage (SeaweedFS locally and in CI):
// tenant isolation of files, upload refusals with visible reasons, downloads
// only after a clean scan, and the jobs admin API. The scan itself runs in the
// worker and is tested there (apps/worker/test/integration/jobs.test.ts);
// here a fixture marks the upload clean the way the worker's release step does.
import { schema } from "@originos/db";
import { storageFromEnv } from "@originos/storage";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type Harness, invitationToken, startHarness, uniqueEmail } from "./helpers.js";

const storage = storageFromEnv();
if (!storage.store)
  throw new Error("S3_ENDPOINT must be set for the files integration tests (see .env.example).");
const store = storage.store;
const MAX = 64 * 1024;

let h: Harness;
let bare: Harness;
beforeAll(async () => {
  await store.ensureBuckets();
  h = await startHarness({ storage: { ...storage, maxUploadBytes: MAX } });
  bare = await startHarness();
});
afterAll(async () => {
  await Promise.all([h?.close(), bare?.close()]);
});

type Json = Record<string, unknown>;
const json = (r: { body: string }) => JSON.parse(r.body) as Json;
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);

async function join(owner: Client, role: "admin" | "member"): Promise<Client> {
  const email = uniqueEmail(role);
  const res = await owner.request("POST", "/v1/organization/invitations", { email, role });
  if (res.statusCode !== 201) throw new Error(`invite failed: ${res.body}`);
  const c = await new Client(h).signUp(email);
  const accepted = await c.request("POST", "/v1/invitations/accept", {
    token: invitationToken(h.mailer, email),
  });
  if (accepted.statusCode !== 200) throw new Error(`accept failed: ${accepted.body}`);
  return c;
}

async function org(name: string) {
  const owner = await new Client(h).signUp(uniqueEmail("owner"));
  const res = await owner.request("POST", "/v1/organizations", { name });
  if (res.statusCode !== 201) throw new Error(`org failed: ${res.body}`);
  return owner;
}

/** What the worker's release step does once the scan passes. */
async function markClean(uploadId: string) {
  const [row] = await h.owner.db
    .select()
    .from(schema.uploads)
    .where(eq(schema.uploads.id, uploadId));
  await store.copy("quarantine", "files", row!.quarantineKey);
  await h.owner.db
    .update(schema.uploads)
    .set({
      status: "clean",
      cleanKey: row!.quarantineKey,
      detectedType: row!.declaredType,
      scanner: "test-fixture",
      scannedAt: new Date(),
    })
    .where(eq(schema.uploads.id, uploadId));
}

describe("uploads", () => {
  it("a member uploads a file: stored in quarantine, scan job queued, audited", async () => {
    const owner = await org("Upload Lab");
    const member = await join(owner, "member");
    const res = await member.upload("notes – draft.md", "text/markdown", "# Notes\n\nHello.");
    expect(res.statusCode).toBe(201);
    const up = json(res);
    expect(up).toMatchObject({
      filename: "notes – draft.md",
      declaredType: "text/markdown",
      status: "quarantined",
      byteSize: 15,
    });
    expect(up.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(up.jobId).toMatch(/^job_/);

    const [row] = await h.owner.db
      .select()
      .from(schema.uploads)
      .where(eq(schema.uploads.id, up.id as string));
    expect(await store.exists("quarantine", row!.quarantineKey)).toBe(true);
    expect(await store.exists("files", row!.quarantineKey)).toBe(false);
    const [job] = await h.owner.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.id, up.jobId as string));
    expect(job).toMatchObject({ type: "ingest.scan_upload", status: "pending" });

    const listed = JSON.parse((await owner.request("GET", "/v1/files")).body) as Json[];
    expect(listed.map((f) => f.id)).toContain(up.id);
    const audit = JSON.parse(
      (await owner.request("GET", "/v1/organization/audit-events")).body,
    ) as Json[];
    expect(audit.map((e) => e.action)).toContain("file.uploaded");
  });

  it("refuses bad uploads with a visible reason and stores nothing", async () => {
    const owner = await org("Refusal Lab");
    const cases: [string, string, Uint8Array | string, number, string][] = [
      ["big.txt", "text/plain", "a".repeat(MAX + 1), 413, "too_large"],
      ["empty.txt", "text/plain", "", 400, "empty"],
      ["page.html", "text/html", "<p>hi</p>", 415, "type_not_accepted"],
      ["logo.svg", "image/svg+xml", "<svg/>", 415, "type_not_accepted"],
      ["photo.png", "image/png", "not really a png", 415, "type_mismatch"],
      ["notes.txt", "text/plain", "<!doctype html><script>x</script>", 415, "type_mismatch"],
      ["photo.txt", "image/png", PNG, 415, "type_mismatch"],
      ["../..", "text/plain", "x", 400, "invalid_filename"],
      ["\u202e", "text/plain", "x", 400, "invalid_filename"],
    ];
    for (const [name, type, body, status, code] of cases) {
      const res = await owner.upload(name, type, body);
      expect({ name, status: res.statusCode, code: json(res).error }).toEqual({
        name,
        status,
        code,
      });
      expect(String(json(res).message).length).toBeGreaterThan(10);
    }
    expect(JSON.parse((await owner.request("GET", "/v1/files")).body)).toEqual([]);
  });

  it("keeps only the base name of a path, so a name cannot steer where the file goes", async () => {
    const owner = await org("Path Lab");
    const res = await owner.upload("../../etc/notes.txt", "text/plain", "x");
    expect(res.statusCode).toBe(201);
    expect(json(res).filename).toBe("notes.txt");
  });

  it("accepts files larger than the default 1 MB request body limit", async () => {
    const big = await startHarness({ storage });
    try {
      const c = await new Client(big).signUp(uniqueEmail("big"));
      await c.request("POST", "/v1/organizations", { name: "Big Files" });
      const res = await c.upload("long.txt", "text/plain", "line of text\n".repeat(250_000));
      expect(res.statusCode).toBe(201);
      expect(json(res).byteSize).toBe(3_250_000);
    } finally {
      await big.close();
    }
  });

  it("answers 'not set up' when storage is not configured", async () => {
    const c = await new Client(bare).signUp(uniqueEmail("bare"));
    await c.request("POST", "/v1/organizations", { name: "No Storage" });
    const res = await c.upload("a.txt", "text/plain", "hello");
    expect(res.statusCode).toBe(503);
    expect(json(res).error).toBe("storage_not_configured");
  });

  it("only accepts the binary body on the upload route, and still checks the origin", async () => {
    const owner = await org("CSRF Lab");
    const cross = await owner.upload("a.txt", "text/plain", "hello", {
      origin: "https://evil.example",
    });
    expect(cross.statusCode).toBe(403);
    const other = await h.app.inject({
      method: "POST",
      url: "/v1/organizations",
      headers: {
        origin: "http://localhost:3000",
        cookie: owner.cookieHeader,
        "content-type": "application/octet-stream",
      },
      payload: Buffer.from("{}"),
    });
    expect(other.statusCode).toBe(415);
    expect(json(other).error).toBe("json_required");
  });
});

describe("downloads and tenant isolation", () => {
  it("serves a file only once it is clean, through a short-lived signed URL", async () => {
    const owner = await org("Download Lab");
    const up = json(await owner.upload("hello.txt", "text/plain", "hello, files"));
    const early = await owner.request("POST", `/v1/files/${up.id}/download`);
    expect(early.statusCode).toBe(409);
    expect(json(early).error).toBe("file_not_available");
    expect((await owner.request("GET", `/v1/files/${up.id}/preview`)).statusCode).toBe(409);

    await markClean(up.id as string);
    const link = json(await owner.request("POST", `/v1/files/${up.id}/download`));
    const fetched = await fetch(link.url as string);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get("content-disposition")).toMatch(/^attachment; /);
    expect(await fetched.text()).toBe("hello, files");
    const preview = json(await owner.request("GET", `/v1/files/${up.id}/preview`));
    expect(preview).toEqual({ kind: "text", text: "hello, files", truncated: false });
  });

  it("another organization cannot see, preview or download the file", async () => {
    const owner = await org("Owner Org");
    const up = json(await owner.upload("secret.txt", "text/plain", "private"));
    await markClean(up.id as string);
    const intruder = await org("Intruder Org");
    for (const [method, path] of [
      ["GET", `/v1/files/${up.id}`],
      ["GET", `/v1/files/${up.id}/preview`],
      ["POST", `/v1/files/${up.id}/download`],
    ] as const) {
      const res = await intruder.request(method, path);
      expect({ path, status: res.statusCode }).toEqual({ path, status: 404 });
    }
    const listed = JSON.parse((await intruder.request("GET", "/v1/files")).body) as Json[];
    expect(listed.map((f) => f.id)).not.toContain(up.id);
  });
});

describe("jobs admin", () => {
  it("members cannot use the jobs page; owners and admins can retry, cancel and resume", async () => {
    const owner = await org("Jobs Lab");
    const admin = await join(owner, "admin");
    const member = await join(owner, "member");
    const up = json(await member.upload("a.txt", "text/plain", "hello"));
    const jobId = up.jobId as string;

    expect((await member.request("GET", "/v1/organization/jobs")).statusCode).toBe(403);
    expect((await member.request("POST", `/v1/organization/jobs/${jobId}/cancel`)).statusCode).toBe(
      403,
    );
    const listed = JSON.parse((await admin.request("GET", "/v1/organization/jobs")).body) as Json[];
    expect(listed.find((j) => j.id === jobId)).toMatchObject({ status: "pending" });

    // Retry is only for dead jobs.
    const notDead = await admin.request("POST", `/v1/organization/jobs/${jobId}/retry`);
    expect(notDead.statusCode).toBe(409);
    await h.owner.db
      .update(schema.jobs)
      .set({ status: "dead", attempts: 5, lastError: "fixture", finishedAt: new Date() })
      .where(eq(schema.jobs.id, jobId));
    const dead = JSON.parse(
      (await admin.request("GET", "/v1/organization/jobs?status=dead")).body,
    ) as Json[];
    expect(dead.map((j) => j.id)).toEqual([jobId]);
    expect((await admin.request("POST", `/v1/organization/jobs/${jobId}/retry`)).statusCode).toBe(
      200,
    );

    // A job waiting for a person resumes with the decision.
    await h.owner.db
      .update(schema.jobs)
      .set({ status: "waiting", waitReason: "Check the file" })
      .where(eq(schema.jobs.id, jobId));
    const bad = await owner.request("POST", `/v1/organization/jobs/${jobId}/resume`, {
      decision: "maybe",
    });
    expect(bad.statusCode).toBe(400);
    const resumed = await owner.request("POST", `/v1/organization/jobs/${jobId}/resume`, {
      decision: "approve",
      note: "looks fine",
    });
    expect(resumed.statusCode).toBe(200);
    const [job] = await h.owner.db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    expect(job).toMatchObject({ status: "pending", waitReason: null });
    expect(job!.resumeInput).toMatchObject({ decision: "approve", note: "looks fine" });

    expect((await owner.request("POST", `/v1/organization/jobs/${jobId}/cancel`)).statusCode).toBe(
      200,
    );
    const [cancelled] = await h.owner.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.id, jobId));
    expect(cancelled!.status).toBe("cancelled");

    const audit = JSON.parse(
      (await owner.request("GET", "/v1/organization/audit-events")).body,
    ) as Json[];
    const actions = audit.map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(["job.retried", "job.resumed", "job.cancel_requested"]),
    );

    // Another organization's owner cannot touch it.
    const other = await org("Other Jobs Org");
    expect((await other.request("POST", `/v1/organization/jobs/${jobId}/retry`)).statusCode).toBe(
      404,
    );
  });
});
