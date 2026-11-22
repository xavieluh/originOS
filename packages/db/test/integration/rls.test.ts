// Row-level security for tenant-owned tables, against a real PostgreSQL.
// Fixtures are written as the schema owner; every assertion runs as the
// application role, exactly as the API does.
import { randomUUID, createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  APPLICATION_ROLE,
  createDatabase,
  runMigrations,
  schema,
  setTenant,
  withScope,
} from "../../src/index.js";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error("TEST_DATABASE_URL must be set for integration tests (see .env.example).");

const owner = createDatabase({ url });
const app = createDatabase({ url, role: APPLICATION_ROLE });
const { users, organizations, memberships, invitations, auditEvents } = schema;

/** Drizzle wraps driver errors; the Postgres message is on `cause`. */
async function expectRlsDenied(promise: Promise<unknown>): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "expected the database to refuse the write").toBeInstanceOf(Error);
  const messages: string[] = [];
  for (let e: unknown = error; e instanceof Error; e = e.cause) messages.push(e.message);
  expect(messages.join(" | ")).toMatch(/row-level security/);
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const ids = {
  alice: randomUUID(),
  bob: randomUUID(),
  carol: randomUUID(),
  orgA: randomUUID(),
  orgB: randomUUID(),
};
const tag = ids.orgA.slice(0, 8);
const carolToken = `token-${randomUUID()}`;
const expiredToken = `token-${randomUUID()}`;

beforeAll(async () => {
  await runMigrations(owner);
  const db = owner.db;
  await db.insert(users).values([
    { id: ids.alice, name: "Alice", email: `alice-${tag}@example.test`, emailVerified: true },
    { id: ids.bob, name: "Bob", email: `bob-${tag}@example.test`, emailVerified: true },
    { id: ids.carol, name: "Carol", email: `carol-${tag}@example.test`, emailVerified: true },
  ]);
  await db.insert(organizations).values([
    { id: ids.orgA, name: "Org A", slug: `org-a-${tag}`, createdBy: ids.alice },
    { id: ids.orgB, name: "Org B", slug: `org-b-${tag}`, createdBy: ids.bob },
  ]);
  await db.insert(memberships).values([
    { tenantId: ids.orgA, userId: ids.alice, role: "owner" },
    { tenantId: ids.orgB, userId: ids.bob, role: "owner" },
  ]);
  const inAnHour = new Date(Date.now() + 3_600_000);
  await db.insert(invitations).values([
    {
      tenantId: ids.orgB,
      email: `carol-${tag}@example.test`,
      role: "member",
      tokenHash: sha256(carolToken),
      invitedBy: ids.bob,
      expiresAt: inAnHour,
    },
    {
      tenantId: ids.orgB,
      email: `carol-${tag}@example.test`,
      role: "admin",
      tokenHash: sha256(expiredToken),
      invitedBy: ids.bob,
      expiresAt: new Date(Date.now() - 1000),
    },
  ]);
  await db.insert(auditEvents).values({
    tenantId: ids.orgB,
    actorUserId: ids.bob,
    action: "organization.created",
    targetType: "organization",
    targetId: ids.orgB,
  });
});

afterAll(async () => {
  await owner.db
    .delete(organizations)
    .where(sql`${organizations.id} in (${ids.orgA}, ${ids.orgB})`);
  await owner.db.delete(users).where(sql`${users.id} in (${ids.alice}, ${ids.bob}, ${ids.carol})`);
  await Promise.all([owner.close(), app.close()]);
});

describe("application role", () => {
  it("is not a superuser and cannot bypass RLS", async () => {
    const r = await app.pool.query<{
      current_user: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      "select current_user, r.rolsuper, r.rolbypassrls from pg_roles r where r.rolname = current_user",
    );
    expect(r.rows[0]).toEqual({
      current_user: APPLICATION_ROLE,
      rolsuper: false,
      rolbypassrls: false,
    });
  });

  it("sees no tenant rows without a scope", async () => {
    for (const table of ["organizations", "memberships", "invitations", "audit_events"]) {
      const r = await app.pool.query(`select count(*)::int as n from core.${table}`);
      expect(r.rows[0], table).toEqual({ n: 0 });
    }
  });

  it("cannot update or delete audit events", async () => {
    await expect(app.pool.query("update core.audit_events set action = 'x'")).rejects.toThrow(
      /permission denied/,
    );
    await expect(app.pool.query("delete from core.audit_events")).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("cross-organization isolation", () => {
  it("a member sees only their own organizations and rosters", async () => {
    const orgs = await withScope(app.db, { userId: ids.alice }, (tx) =>
      tx.select().from(organizations),
    );
    expect(orgs.map((o) => o.id)).toEqual([ids.orgA]);
  });

  it("a forged tenant id reveals nothing to a non-member", async () => {
    const rows = await withScope(app.db, { userId: ids.alice, tenantId: ids.orgB }, async (tx) => ({
      orgs: await tx.select().from(organizations).where(eq(organizations.id, ids.orgB)),
      members: await tx.select().from(memberships).where(eq(memberships.tenantId, ids.orgB)),
      invites: await tx.select().from(invitations).where(eq(invitations.tenantId, ids.orgB)),
      audit: await tx.select().from(auditEvents).where(eq(auditEvents.tenantId, ids.orgB)),
    }));
    expect(rows).toEqual({ orgs: [], members: [], invites: [], audit: [] });
  });

  it("a non-member cannot join, invite, rename or write audit events in another tenant", async () => {
    const attempt = (fn: Parameters<typeof withScope>[2]) =>
      withScope(app.db, { userId: ids.alice, tenantId: ids.orgB }, fn);
    await expectRlsDenied(
      attempt((tx) =>
        tx.insert(memberships).values({ tenantId: ids.orgB, userId: ids.alice, role: "member" }),
      ),
    );
    await expectRlsDenied(
      attempt((tx) =>
        tx.insert(memberships).values({ tenantId: ids.orgB, userId: ids.alice, role: "owner" }),
      ),
    );
    await expectRlsDenied(
      attempt((tx) =>
        tx.insert(invitations).values({
          tenantId: ids.orgB,
          email: "x@example.test",
          role: "admin",
          tokenHash: sha256(randomUUID()),
          invitedBy: ids.alice,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      ),
    );
    await expectRlsDenied(
      attempt((tx) =>
        tx.insert(auditEvents).values({
          tenantId: ids.orgB,
          actorUserId: ids.alice,
          action: "x",
          targetType: "x",
          targetId: "x",
        }),
      ),
    );
    const renamed = await attempt((tx) =>
      tx
        .update(organizations)
        .set({ name: "pwned" })
        .where(eq(organizations.id, ids.orgB))
        .returning(),
    );
    expect(renamed).toEqual([]);
    const transferred = await attempt((tx) =>
      tx.execute(sql`select core.transfer_ownership(${ids.alice}) as ok`),
    );
    expect(transferred.rows[0]).toEqual({ ok: false });
  });

  it("nobody can create a second owner by update", async () => {
    // Bob is the only member, and the owner's own row is excluded from updates.
    const promoted = await withScope(app.db, { userId: ids.bob, tenantId: ids.orgB }, (tx) =>
      tx
        .update(memberships)
        .set({ role: "owner" })
        .where(eq(memberships.tenantId, ids.orgB))
        .returning(),
    );
    expect(promoted).toEqual([]);
  });
});

describe("invitations", () => {
  it("only the invited, verified email holding the token can join, once", async () => {
    // Alice cannot use Carol's token for herself.
    await expectRlsDenied(
      withScope(
        app.db,
        { userId: ids.alice, tenantId: ids.orgB, invitationTokenHash: sha256(carolToken) },
        (tx) =>
          tx.insert(memberships).values({ tenantId: ids.orgB, userId: ids.alice, role: "member" }),
      ),
    );
    // Carol cannot escalate the invited role.
    await expectRlsDenied(
      withScope(
        app.db,
        { userId: ids.carol, tenantId: ids.orgB, invitationTokenHash: sha256(carolToken) },
        (tx) =>
          tx.insert(memberships).values({ tenantId: ids.orgB, userId: ids.carol, role: "admin" }),
      ),
    );
    // Expired invitation is refused by the database.
    await expectRlsDenied(
      withScope(
        app.db,
        { userId: ids.carol, tenantId: ids.orgB, invitationTokenHash: sha256(expiredToken) },
        (tx) =>
          tx.insert(memberships).values({ tenantId: ids.orgB, userId: ids.carol, role: "admin" }),
      ),
    );
    // The valid path succeeds.
    await withScope(
      app.db,
      { userId: ids.carol, invitationTokenHash: sha256(carolToken) },
      async (tx) => {
        const [invite] = await tx
          .select()
          .from(invitations)
          .where(eq(invitations.tokenHash, sha256(carolToken)));
        expect(invite?.tenantId).toBe(ids.orgB);
        await setTenant(tx, ids.orgB);
        await tx
          .insert(memberships)
          .values({ tenantId: ids.orgB, userId: ids.carol, role: "member" });
        await tx
          .update(invitations)
          .set({ acceptedAt: new Date(), acceptedBy: ids.carol })
          .where(eq(invitations.tokenHash, sha256(carolToken)));
      },
    );
    const orgs = await withScope(app.db, { userId: ids.carol }, (tx) =>
      tx.select().from(organizations),
    );
    expect(orgs.map((o) => o.id)).toEqual([ids.orgB]);
  });

  it("an invitation token reveals only its own invitation", async () => {
    const rows = await withScope(
      app.db,
      { userId: ids.alice, invitationTokenHash: sha256(carolToken) },
      (tx) => tx.select().from(invitations),
    );
    expect(rows).toHaveLength(1);
  });
});

describe("ownership", () => {
  it("the owner can transfer to a member, and the old owner becomes admin", async () => {
    const result = await withScope(app.db, { userId: ids.bob, tenantId: ids.orgB }, (tx) =>
      tx.execute(sql`select core.transfer_ownership(${ids.carol}) as ok`),
    );
    expect(result.rows[0]).toEqual({ ok: true });
    const roster = await owner.db
      .select()
      .from(memberships)
      .where(eq(memberships.tenantId, ids.orgB));
    expect(Object.fromEntries(roster.map((m) => [m.userId, m.role]))).toEqual({
      [ids.bob]: "admin",
      [ids.carol]: "owner",
    });
  });

  it("an admin cannot remove the owner", async () => {
    const removed = await withScope(app.db, { userId: ids.bob, tenantId: ids.orgB }, (tx) =>
      tx.delete(memberships).where(eq(memberships.userId, ids.carol)).returning(),
    );
    expect(removed).toEqual([]);
  });
});
