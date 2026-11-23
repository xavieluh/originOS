// Phase 08 acceptance (worker side): a disconnected connection makes no new
// provider calls; retried calls reuse their idempotency key; expiring tokens
// refresh; a refused grant marks the connection degraded; revocation reaches
// the provider and erases the sealed tokens; key rotation rewraps tokens.
// Uses the fake provider (test-only) and a real PostgreSQL.
import { randomUUID } from "node:crypto";
import {
  type Connect,
  authorizeUrl,
  createPkce,
  exchangeCode,
  generateKeySpec,
  open,
  parseKeyring,
  seal,
  sealedKeyId,
  testProviderDefinition,
  tokenContext,
} from "@originos/connect";
import { FAKE_TOKEN_PREFIX, type FakeProvider, startFakeProvider } from "@originos/connect/testing";
import { newConnectionId } from "@originos/contracts";
import { WORKER_ROLE, createDatabase, enqueueJob, schema } from "@originos/db";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ConnectionRevoked, createProviderClient } from "../../src/connect/provider-client.js";
import { rewrapTokens } from "../../src/connect/rewrap.js";
import { type JobHandler, createJobRunner } from "../../src/job-runner.js";
import { connectCheckHandler, connectRevokeHandler } from "../../src/jobs/connect.js";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error("TEST_DATABASE_URL must be set for integration tests (see .env.example).");

const owner = createDatabase({ url });
const worker = createDatabase({ url, role: WORKER_ROLE });
const { integrationConnections: conns, jobs } = schema;
const admin = randomUUID();
const tenantId = randomUUID();
const k1Spec = generateKeySpec("k1");
let fake: FakeProvider;
let connect: Connect;
const redirectUri = "http://localhost:3000/integrations/callback/test-provider";

beforeAll(async () => {
  fake = await startFakeProvider({ clientId: "wk-client", clientSecret: "wk-secret" });
  connect = {
    keyring: parseKeyring(k1Spec),
    providers: [
      {
        definition: testProviderDefinition(fake.url),
        clientId: "wk-client",
        clientSecret: "wk-secret",
        webhookSecret: null,
        missing: [],
      },
    ],
  };
  await owner.db
    .insert(schema.users)
    .values({ id: admin, name: "Admin", email: `c-${tenantId}@example.test` });
  await owner.db.insert(schema.organizations).values({
    id: tenantId,
    name: "Connect",
    slug: `connect-${tenantId.slice(0, 8)}`,
    createdBy: admin,
  });
  await owner.db.insert(schema.memberships).values({ tenantId, userId: admin, role: "owner" });
  // API tests leave connect jobs for connections sealed with their own keys.
  await owner.db
    .update(jobs)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(like(jobs.type, "connect.%"));
});
afterAll(async () => {
  await owner.db.delete(schema.organizations).where(eq(schema.organizations.id, tenantId));
  await owner.db.delete(schema.users).where(eq(schema.users.id, admin));
  await fake?.close();
  await Promise.all([owner.close(), worker.close()]);
});
beforeEach(() => fake.reset());

/** Connect the way the API does: authorize at the fake provider, exchange, seal, store. */
async function connection(expiresAt?: Date): Promise<string> {
  const config = connect.providers[0]!;
  const pkce = createPkce();
  const back = new URL(
    fake.approve(
      authorizeUrl(config, {
        redirectUri,
        state: "s",
        challenge: pkce.challenge,
        scopes: ["profile", "echo"],
      }),
    ),
  );
  const tokens = await exchangeCode(config, {
    code: back.searchParams.get("code")!,
    redirectUri,
    verifier: pkce.verifier,
    scopes: ["profile", "echo"],
  });
  const id = newConnectionId();
  await owner.db.insert(conns).values({
    id,
    tenantId,
    provider: "test-provider",
    accountId: `acct-${id}`,
    accountLabel: "test-user",
    grantedScopes: [...tokens.scopes],
    accessTokenSealed: seal(
      connect.keyring!,
      tokens.accessToken,
      tokenContext(tenantId, id, "access"),
    ),
    refreshTokenSealed: seal(
      connect.keyring!,
      tokens.refreshToken!,
      tokenContext(tenantId, id, "refresh"),
    ),
    tokenKeyId: "k1",
    tokenExpiresAt: expiresAt ?? tokens.expiresAt,
    connectedByUserId: admin,
  });
  return id;
}

const row = async (id: string) => (await owner.db.select().from(conns).where(eq(conns.id, id)))[0]!;
const revoke = (id: string) =>
  owner.db
    .update(conns)
    .set({ status: "revoked", revokedAt: new Date(), revokedByUserId: admin })
    .where(eq(conns.id, id));
const enqueue = (type: string, connectionId: string, maxAttempts = 5) =>
  owner.db.transaction((tx) =>
    enqueueJob(tx, {
      tenantId,
      type,
      payload: { connectionId },
      subjectRef: connectionId,
      createdByUserId: admin,
      maxAttempts,
    }),
  );
const runner = (handlers: JobHandler[]) =>
  createJobRunner({
    db: worker.db,
    handlers,
    workerId: `w-${randomUUID().slice(0, 6)}`,
    retryInMs: () => 0,
  });
const job = async (id: string) => (await owner.db.select().from(jobs).where(eq(jobs.id, id)))[0]!;

describe("disconnected providers stop new API calls", () => {
  it("refuses to call for a revoked connection, without contacting the provider", async () => {
    const id = await connection();
    await revoke(id);
    const client = createProviderClient(worker.db, connect);
    await expect(
      client.call(tenantId, id, { method: "GET", path: "/api/me" }),
    ).rejects.toBeInstanceOf(ConnectionRevoked);
    expect(fake.state().apiCalls).toBe(0);
  });

  it("a job waiting to retry makes no further call once disconnected", async () => {
    const id = await connection();
    fake.failNext(503, 1);
    const { id: jobId } = await enqueue("connect.check", id);
    const r = runner([connectCheckHandler(connect)]);
    expect(await r.runOnce()).toMatchObject({ claimed: 1, retried: 1 });
    expect(fake.state().apiCalls).toBe(1);
    await revoke(id);
    expect(await r.runOnce()).toMatchObject({ claimed: 1, succeeded: 1 });
    expect((await job(jobId)).result).toMatchObject({ ok: false, revoked: true });
    expect(fake.state().apiCalls).toBe(1);
  });

  it("refuses a connection from another tenant", async () => {
    const id = await connection();
    const client = createProviderClient(worker.db, connect);
    await expect(client.call(randomUUID(), id, { method: "GET", path: "/api/me" })).rejects.toThrow(
      /does not exist/,
    );
  });
});

describe("outbound delivery manager", () => {
  it("checks a connection and records the time", async () => {
    const id = await connection();
    const { id: jobId } = await enqueue("connect.check", id);
    expect(await runner([connectCheckHandler(connect)]).runOnce()).toMatchObject({ succeeded: 1 });
    expect((await job(jobId)).result).toMatchObject({ ok: true });
    const r = await row(id);
    expect(r.lastCheckedAt).toBeInstanceOf(Date);
    expect(r.status).toBe("connected");
  });

  it("retries a failed call with the same idempotency key, applied once", async () => {
    const id = await connection();
    const client = createProviderClient(worker.db, connect);
    let crashed = false;
    const deliver: JobHandler = {
      type: "connect.test_deliver",
      async run(ctx) {
        await client.call(ctx.job.tenantId, id, {
          method: "POST",
          path: "/api/echo",
          body: { hello: "world" },
          idempotencyKey: `${ctx.job.id}:echo`,
        });
        // The first attempt "crashes" after the provider applied the call.
        if (!crashed) {
          crashed = true;
          throw new Error("worker lost the response");
        }
        return { delivered: true };
      },
    };
    fake.failNext(503, 1);
    const { id: jobId } = await enqueue("connect.test_deliver", id);
    const r = runner([deliver]);
    expect(await r.runOnce()).toMatchObject({ retried: 1 }); // 503: retryable
    expect(await r.runOnce()).toMatchObject({ retried: 1 }); // applied, then crashed
    expect(await r.runOnce()).toMatchObject({ succeeded: 1 }); // same key again
    expect(fake.state().echoKeys).toEqual({ [`${jobId}:echo`]: 2 });
    expect(fake.state().echoApplied).toBe(1);
  });

  it("refreshes an expiring token and stores the rotated tokens sealed", async () => {
    const id = await connection(new Date(Date.now() - 1000));
    const before = await row(id);
    fake.expireAccessTokens();
    const client = createProviderClient(worker.db, connect);
    const res = await client.call(tenantId, id, { method: "GET", path: "/api/me" });
    expect(res.body).toMatchObject({ login: "test-user" });
    const after = await row(id);
    expect(after.accessTokenSealed).not.toBe(before.accessTokenSealed);
    expect(after.refreshTokenSealed).not.toBe(before.refreshTokenSealed);
    expect(after.tokenExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(after.accessTokenSealed).not.toContain(FAKE_TOKEN_PREFIX);
  });

  it("marks the connection degraded when the provider refuses the grant, then fails without retrying", async () => {
    const id = await connection();
    fake.revokeAll();
    const { id: jobId } = await enqueue("connect.check", id);
    expect(await runner([connectCheckHandler(connect)]).runOnce()).toMatchObject({ dead: 1 });
    const r = await row(id);
    expect(r.status).toBe("degraded");
    expect(r.lastError).toMatch(/Reconnect/);
    expect((await job(jobId)).lastError).not.toContain(FAKE_TOKEN_PREFIX);
  });
});

describe("revocation", () => {
  it("revokes at the provider and erases the sealed tokens", async () => {
    const id = await connection();
    const token = open(
      connect.keyring!,
      (await row(id)).accessTokenSealed!,
      tokenContext(tenantId, id, "access"),
    );
    await revoke(id);
    await enqueue("connect.revoke", id);
    expect(await runner([connectRevokeHandler(connect)]).runOnce()).toMatchObject({ succeeded: 1 });
    expect(fake.state().revocations).toBe(1);
    const r = await row(id);
    expect(r).toMatchObject({
      status: "revoked",
      accessTokenSealed: null,
      refreshTokenSealed: null,
      lastError: null,
    });
    // The token no longer works at the provider either.
    const config = connect.providers[0]!;
    const res = await fetch(`${config.definition.apiBaseUrl}/api/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("refuses to revoke a live connection", async () => {
    const id = await connection();
    await enqueue("connect.revoke", id);
    expect(await runner([connectRevokeHandler(connect)]).runOnce()).toMatchObject({ dead: 1 });
    expect((await row(id)).accessTokenSealed).not.toBeNull();
  });

  it("erases tokens and records why when the provider cannot be told", async () => {
    const id = await connection();
    await revoke(id);
    const unset: Connect = { keyring: connect.keyring, providers: [] };
    await enqueue("connect.revoke", id);
    expect(await runner([connectRevokeHandler(unset)]).runOnce()).toMatchObject({ succeeded: 1 });
    const r = await row(id);
    expect(r.accessTokenSealed).toBeNull();
    expect(r.lastError).toMatch(/provider's settings/);
  });
});

describe("token key rotation", () => {
  it("rewraps tokens under the new active key so the old key can be retired", async () => {
    const id = await connection();
    const k2Spec = generateKeySpec("k2");
    const both = parseKeyring(`${k1Spec},${k2Spec}`, "k2");
    const before = await row(id);
    const result = await rewrapTokens(worker.db, both);
    expect(result.rewrapped).toBeGreaterThanOrEqual(1);
    const after = await row(id);
    expect(after.tokenKeyId).toBe("k2");
    expect(sealedKeyId(after.accessTokenSealed!)).toBe("k2");
    const onlyK2 = parseKeyring(k2Spec);
    expect(open(onlyK2, after.accessTokenSealed!, tokenContext(tenantId, id, "access"))).toBe(
      open(connect.keyring!, before.accessTokenSealed!, tokenContext(tenantId, id, "access")),
    );
    // Rows of this tenant are all on k2 now.
    const remaining = await owner.db
      .select({ kid: conns.tokenKeyId })
      .from(conns)
      .where(inArray(conns.id, [id]));
    expect(remaining).toEqual([{ kid: "k2" }]);
  });
});
