// Phase 08: Origin Connect tables against a real PostgreSQL, as the
// application and worker roles. Sealed tokens are unreadable to the API's
// role; OAuth attempts are private to the person who started them; webhook
// deliveries are recorded once, through core.accept_webhook() only.
import { randomUUID } from "node:crypto";
import { newConnectionId, newEventId, newWebhookDeliveryId } from "@originos/contracts";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  APPLICATION_ROLE,
  WORKER_ROLE,
  createDatabase,
  schema,
  withScope,
} from "../../src/index.js";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error("TEST_DATABASE_URL must be set for integration tests (see .env.example).");

const owner = createDatabase({ url });
const app = createDatabase({ url, role: APPLICATION_ROLE });
const worker = createDatabase({ url, role: WORKER_ROLE });
const { integrationConnections: conns, oauthStates, webhookDeliveries } = schema;

async function failure(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "expected the database to refuse").toBeInstanceOf(Error);
  const parts: string[] = [];
  for (let e: unknown = error; e instanceof Error; e = e.cause) parts.push(e.message);
  return parts.join(" | ");
}

const ids = {
  alice: randomUUID(),
  bob: randomUUID(),
  outsider: randomUUID(),
  org: randomUUID(),
  other: randomUUID(),
};
const tag = ids.org.slice(0, 8);
const as = (userId: string, tenantId = ids.org) => ({ userId, tenantId });
const connectionId = newConnectionId();

const safeColumns = {
  id: conns.id,
  status: conns.status,
  accountLabel: conns.accountLabel,
};

beforeAll(async () => {
  await owner.db.insert(schema.users).values([
    { id: ids.alice, name: "Alice", email: `alice-${tag}@example.test`, emailVerified: true },
    { id: ids.bob, name: "Bob", email: `bob-${tag}@example.test`, emailVerified: true },
    { id: ids.outsider, name: "Out", email: `out-${tag}@example.test`, emailVerified: true },
  ]);
  await owner.db.insert(schema.organizations).values([
    { id: ids.org, name: "Lab", slug: `lab-${tag}`, createdBy: ids.alice },
    { id: ids.other, name: "Other", slug: `other-${tag}`, createdBy: ids.outsider },
  ]);
  await owner.db.insert(schema.memberships).values([
    { tenantId: ids.org, userId: ids.alice, role: "owner" },
    { tenantId: ids.org, userId: ids.bob, role: "member" },
    { tenantId: ids.other, userId: ids.outsider, role: "owner" },
  ]);
});

afterAll(async () => {
  await owner.db
    .delete(schema.organizations)
    .where(sql`${schema.organizations.id} in (${ids.org}, ${ids.other})`);
  await owner.db
    .delete(schema.users)
    .where(sql`${schema.users.id} in (${ids.alice}, ${ids.bob}, ${ids.outsider})`);
  await Promise.all([owner.close(), app.close(), worker.close()]);
});

const connectionRow = (overrides: Partial<typeof conns.$inferInsert> = {}) => ({
  id: connectionId,
  tenantId: ids.org,
  provider: "test-provider",
  accountId: "acct-1",
  accountLabel: "test-user",
  grantedScopes: ["profile"],
  accessTokenSealed: "v1~k1~sealed-access",
  refreshTokenSealed: "v1~k1~sealed-refresh",
  tokenKeyId: "k1",
  connectedByUserId: ids.alice,
  ...overrides,
});

describe("integration connections", () => {
  it("lets an owner connect but not a member, and never as someone else", async () => {
    const msg = await failure(
      withScope(app.db, as(ids.bob), (tx) =>
        tx
          .insert(conns)
          .values(connectionRow({ id: newConnectionId(), connectedByUserId: ids.bob })),
      ),
    );
    expect(msg).toMatch(/row-level security/);
    expect(
      await failure(
        withScope(app.db, as(ids.alice), (tx) =>
          tx
            .insert(conns)
            .values(connectionRow({ id: newConnectionId(), connectedByUserId: ids.bob })),
        ),
      ),
    ).toMatch(/row-level security/);
    await withScope(app.db, as(ids.alice), (tx) => tx.insert(conns).values(connectionRow()));
  });

  it("does not let the application role read sealed tokens", async () => {
    const visible = await withScope(app.db, as(ids.bob), (tx) =>
      tx.select(safeColumns).from(conns),
    );
    expect(visible).toEqual([{ id: connectionId, status: "connected", accountLabel: "test-user" }]);
    expect(
      await failure(
        withScope(app.db, as(ids.alice), (tx) =>
          tx.select({ token: conns.accessTokenSealed }).from(conns),
        ),
      ),
    ).toMatch(/permission denied/);
    expect(
      await failure(withScope(app.db, as(ids.alice), (tx) => tx.select().from(conns))),
    ).toMatch(/permission denied/);
    // The worker, which makes provider calls, can.
    const [row] = await worker.db
      .select({ token: conns.accessTokenSealed })
      .from(conns)
      .where(eq(conns.id, connectionId));
    expect(row?.token).toBe("v1~k1~sealed-access");
  });

  it("isolates tenants and refuses a second live row for the same account", async () => {
    expect(
      await withScope(app.db, as(ids.outsider, ids.other), (tx) =>
        tx.select(safeColumns).from(conns),
      ),
    ).toEqual([]);
    expect(
      await failure(
        withScope(app.db, as(ids.alice), (tx) =>
          tx.insert(conns).values(connectionRow({ id: newConnectionId() })),
        ),
      ),
    ).toMatch(/integration_connections_account_uq/);
  });

  it("requires revoked_at exactly when revoked, and members cannot update", async () => {
    const updated = await withScope(app.db, as(ids.bob), (tx) =>
      tx
        .update(conns)
        .set({ lastError: "x" })
        .where(eq(conns.id, connectionId))
        .returning({ id: conns.id }),
    );
    expect(updated).toEqual([]);
    expect(
      await failure(
        withScope(app.db, as(ids.alice), (tx) =>
          tx.update(conns).set({ status: "revoked" }).where(eq(conns.id, connectionId)),
        ),
      ),
    ).toMatch(/integration_connections_revoked_ck/);
  });
});

describe("OAuth attempts", () => {
  const hash = "a".repeat(64);
  it("are private to the person and organization that started them", async () => {
    await withScope(app.db, as(ids.alice), (tx) =>
      tx.insert(oauthStates).values({
        stateHash: hash,
        tenantId: ids.org,
        userId: ids.alice,
        provider: "test-provider",
        codeVerifier: "verifier",
        redirectUri: "http://localhost:3000/integrations/callback/test-provider",
        scopes: ["profile"],
        expiresAt: new Date(Date.now() + 600_000),
      }),
    );
    expect(await withScope(app.db, as(ids.bob), (tx) => tx.select().from(oauthStates))).toEqual([]);
    expect(
      await withScope(app.db, as(ids.alice), (tx) =>
        tx.select({ h: oauthStates.stateHash }).from(oauthStates),
      ),
    ).toEqual([{ h: hash }]);
    // Members cannot start one.
    expect(
      await failure(
        withScope(app.db, as(ids.bob), (tx) =>
          tx.insert(oauthStates).values({
            stateHash: "b".repeat(64),
            tenantId: ids.org,
            userId: ids.bob,
            provider: "test-provider",
            codeVerifier: "v",
            redirectUri: "http://x",
            scopes: [],
            expiresAt: new Date(Date.now() + 600_000),
          }),
        ),
      ),
    ).toMatch(/row-level security/);
  });
});

describe("webhook deliveries", () => {
  const accept = (deliveryId: string, connection = connectionId, provider = "test-provider") =>
    app.db
      .execute<{ result: string }>(
        sql`select core.accept_webhook(${connection}, ${provider}, ${deliveryId}, 'test.ping',
          ${JSON.stringify({ hello: "world" })}::jsonb, ${"0".repeat(64)}, 17,
          ${newWebhookDeliveryId()}, ${newEventId()}, 'corr-1') as result`,
      )
      .then((r) => r.rows[0]?.result);

  it("records a delivery once and appends one outbox event, without a session", async () => {
    expect(await accept("d-1")).toBe("accepted");
    expect(await accept("d-1")).toBe("duplicate");
    // The same signed body under a new delivery id is a replay, not a new event (0012).
    expect(await accept("d-1-replayed-with-a-new-id")).toBe("duplicate");
    expect(await accept("d-2", newConnectionId())).toBe("unknown_connection");
    expect(await accept("d-3", connectionId, "github")).toBe("unknown_connection");
    const rows = await owner.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.connectionId, connectionId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenantId: ids.org, deliveryId: "d-1", event: "test.ping" });
    const events = await owner.db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.subjectRef, rows[0]!.id));
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({
      deliveryId: rows[0]!.id,
      connectionId,
      provider: "test-provider",
      event: "test.ping",
    });
  });

  it("cannot be inserted directly by the application role", async () => {
    expect(
      await failure(
        withScope(app.db, as(ids.alice), (tx) =>
          tx.insert(webhookDeliveries).values({
            tenantId: ids.org,
            connectionId,
            provider: "test-provider",
            deliveryId: "direct",
            event: "x",
            payload: {},
            payloadSha256: "0".repeat(64),
            byteSize: 2,
          }),
        ),
      ),
    ).toMatch(/permission denied/);
  });

  it("is visible to owners and admins of the tenant only", async () => {
    expect(
      await withScope(app.db, as(ids.bob), (tx) => tx.select().from(webhookDeliveries)),
    ).toEqual([]);
    expect(
      await withScope(app.db, as(ids.alice), (tx) => tx.select().from(webhookDeliveries)),
    ).toHaveLength(1);
  });

  it("refuses deliveries for a revoked connection", async () => {
    await withScope(app.db, as(ids.alice), (tx) =>
      tx
        .update(conns)
        .set({ status: "revoked", revokedAt: new Date(), revokedByUserId: ids.alice })
        .where(eq(conns.id, connectionId)),
    );
    expect(await accept("d-4")).toBe("revoked");
  });
});
