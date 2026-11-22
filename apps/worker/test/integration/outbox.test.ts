// Phase 06 acceptance: the outbox survives a worker outage and each consumer
// processes an event once. Runs the real dispatcher against PostgreSQL, as the
// worker role, with events written by the application role.
import { randomUUID } from "node:crypto";
import {
  APPLICATION_ROLE,
  WORKER_ROLE,
  type OutboxEvent,
  type Tx,
  claimEvents,
  consumeOnce,
  createDatabase,
  enqueueEvent,
  schema,
  withScope,
} from "@originos/db";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type OutboxConsumer, createOutboxDispatcher } from "../../src/outbox-dispatcher.js";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error("TEST_DATABASE_URL must be set for integration tests (see .env.example).");

const owner = createDatabase({ url });
const app = createDatabase({ url, role: APPLICATION_ROLE });
const worker = createDatabase({ url, role: WORKER_ROLE });
const s = schema;
const userId = randomUUID();
const tenantId = randomUUID();
const EFFECTS = "outbox_test_effects";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A consumer whose effect is a row written in the receipt's transaction, so
 * "processed once" is checked in the database, not in process memory.
 */
function recorder(
  name: string,
  options: { failTimes?: number; always?: boolean } = {},
): OutboxConsumer {
  let failures = 0;
  return {
    name,
    eventTypes: ["test.happened"],
    async handle(event: OutboxEvent, tx: Tx) {
      await tx.execute(
        sql`insert into public.outbox_test_effects (event_id, consumer) values (${event.id}, ${name})`,
      );
      if (options.always || failures < (options.failTimes ?? 0)) {
        failures += 1;
        throw new Error("downstream unavailable"); // rolls back the effect and the receipt
      }
    },
  };
}

async function effects(eventIds: readonly string[]) {
  const result = await owner.db.execute<{ event_id: string; consumer: string }>(
    sql`select event_id, consumer from public.outbox_test_effects where event_id in (${sql.join(
      eventIds.map((id) => sql`${id}`),
      sql`, `,
    )})`,
  );
  return result.rows;
}

async function enqueue(count = 1): Promise<string[]> {
  return withScope(app.db, { userId, tenantId }, async (tx) => {
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1)
      ids.push(await enqueueEvent(tx, { tenantId, type: "test.happened", payload: { i } }));
    return ids;
  });
}

const event = async (id: string) =>
  (await owner.db.select().from(s.outboxEvents).where(eq(s.outboxEvents.id, id)))[0]!;

beforeAll(async () => {
  // Test fixture only: a table the worker role may write, standing in for a consumer's own data.
  await owner.db.execute(
    sql.raw(
      `create table if not exists public.${EFFECTS} (event_id text not null, consumer text not null)`,
    ),
  );
  await owner.db.execute(sql.raw(`grant select, insert on public.${EFFECTS} to ${WORKER_ROLE}`));
  await owner.db
    .insert(s.users)
    .values({ id: userId, name: "Producer", email: `p-${tenantId}@example.test` });
  await owner.db.insert(s.organizations).values({
    id: tenantId,
    name: "Outbox",
    slug: `outbox-${tenantId.slice(0, 8)}`,
    createdBy: userId,
  });
  await owner.db.insert(s.memberships).values({ tenantId, userId, role: "owner" });
});

beforeEach(async () => {
  // The dispatcher claims across tenants; settle anything left by earlier runs on this test database.
  await owner.db
    .update(s.outboxEvents)
    .set({ status: "dead", lastError: "test reset" })
    .where(eq(s.outboxEvents.status, "pending"));
});

afterAll(async () => {
  await owner.db.delete(s.organizations).where(eq(s.organizations.id, tenantId)); // cascades to its events
  await owner.db.delete(s.users).where(eq(s.users.id, userId));
  await Promise.all([owner.close(), app.close(), worker.close()]);
});

describe("outbox dispatch", () => {
  it("delivers each event once per consumer", async () => {
    const ids = await enqueue(3);
    const dispatcher = createOutboxDispatcher({
      db: worker.db,
      workerId: "w1",
      consumers: [recorder("search"), recorder("notify")],
    });
    expect(await dispatcher.runOnce()).toMatchObject({ claimed: 3, delivered: 3 });
    expect(await dispatcher.runOnce()).toMatchObject({ claimed: 0 });
    expect(await effects(ids)).toHaveLength(6);
    for (const id of ids) expect((await event(id)).status).toBe("delivered");
  });

  it("survives a worker outage: a dead worker's lease expires and another worker finishes the event", async () => {
    const [id] = await enqueue();
    // Worker A claims the event and dies before doing anything.
    expect(
      await claimEvents(worker.db, { workerId: "dead-a", limit: 10, leaseMs: 300 }),
    ).toHaveLength(1);
    const b = createOutboxDispatcher({
      db: worker.db,
      workerId: "b",
      consumers: [recorder("search")],
    });
    expect((await b.runOnce()).claimed).toBe(0); // still leased to A
    await sleep(400);
    expect(await b.runOnce()).toMatchObject({ claimed: 1, delivered: 1 });
    expect(await effects([id!])).toHaveLength(1);
    expect(await event(id!)).toMatchObject({ status: "delivered", attempts: 2, lockedBy: null });
  });

  it("a worker that crashes after a consumer committed does not cause a second run of that consumer", async () => {
    const [id] = await enqueue();
    const search = recorder("search");
    const [claimed] = await claimEvents(worker.db, { workerId: "dead-a", limit: 10, leaseMs: 200 });
    await consumeOnce(worker.db, id!, search.name, (tx) => search.handle(claimed!, tx));
    // ...crash here, before the event is marked delivered.
    await sleep(300);
    const b = createOutboxDispatcher({
      db: worker.db,
      workerId: "b",
      consumers: [search, recorder("notify")],
    });
    expect(await b.runOnce()).toMatchObject({ claimed: 1, delivered: 1 });
    const rows = await effects([id!]);
    expect(rows.map((r) => r.consumer).sort()).toEqual(["notify", "search"]);
  });

  it("retries a failing consumer with backoff, leaving no partial effects", async () => {
    const [id] = await enqueue();
    const flaky = recorder("flaky", { failTimes: 1 });
    const d = createOutboxDispatcher({
      db: worker.db,
      workerId: "w",
      consumers: [flaky],
      retryInMs: () => 200,
    });
    expect(await d.runOnce()).toMatchObject({ claimed: 1, retried: 1 });
    expect(await effects([id!])).toHaveLength(0); // the failed attempt rolled back
    const failed = await event(id!);
    expect(failed).toMatchObject({
      status: "pending",
      lastError: "Error: downstream unavailable",
      lockedBy: null,
    });
    expect(failed.availableAt.getTime()).toBeGreaterThan(Date.now());
    expect((await d.runOnce()).claimed).toBe(0); // not due yet
    await sleep(300);
    expect(await d.runOnce()).toMatchObject({ claimed: 1, delivered: 1 });
    expect(await effects([id!])).toHaveLength(1);
  });

  it("dead-letters an event after the maximum number of attempts", async () => {
    const [id] = await enqueue();
    const d = createOutboxDispatcher({
      db: worker.db,
      workerId: "w",
      consumers: [recorder("broken", { always: true })],
      maxAttempts: 2,
      retryInMs: () => 0,
    });
    expect(await d.runOnce()).toMatchObject({ retried: 1 });
    expect(await d.runOnce()).toMatchObject({ dead: 1 });
    expect(await d.runOnce()).toMatchObject({ claimed: 0 });
    expect(await event(id!)).toMatchObject({ status: "dead", attempts: 2 });
    expect(await effects([id!])).toHaveLength(0);
  });

  it("concurrent workers never claim the same event", async () => {
    const ids = await enqueue(30);
    const consumer = recorder("search");
    const workers = ["w1", "w2", "w3"].map((workerId) =>
      createOutboxDispatcher({ db: worker.db, workerId, consumers: [consumer], batchSize: 30 }),
    );
    const results = await Promise.all(workers.map((w) => w.runOnce()));
    expect(results.reduce((n, r) => n + r.claimed, 0)).toBe(30);
    expect(results.reduce((n, r) => n + r.delivered, 0)).toBe(30);
    const rows = await effects(ids);
    expect(new Set(rows.map((r) => r.event_id)).size).toBe(30);
    expect(rows).toHaveLength(30);
  });
});

describe("outbox roles", () => {
  it("the worker role reads events but no tenant data", async () => {
    await expect(worker.db.select().from(s.works)).rejects.toThrow();
    await expect(worker.db.select().from(s.memberships)).rejects.toThrow();
  });

  it("the application role appends events for its own tenant only, and cannot read or settle them", async () => {
    const [id] = await enqueue();
    const read = await withScope(app.db, { userId, tenantId }, (tx) =>
      tx
        .select()
        .from(s.outboxEvents)
        .where(inArray(s.outboxEvents.id, [id!])),
    ).catch((e: unknown) => e);
    expect(read).toBeInstanceOf(Error);
    const other = randomUUID();
    await expect(
      withScope(app.db, { userId, tenantId: other }, (tx) =>
        enqueueEvent(tx, { tenantId: other, type: "test.happened" }),
      ),
    ).rejects.toThrow();
    await expect(enqueue().then(() => undefined)).resolves.toBeUndefined();
  });
});
