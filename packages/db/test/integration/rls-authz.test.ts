// Row-level security for agents, permission grants and consents (migration 0003),
// against a real PostgreSQL, as the application role.
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  APPLICATION_ROLE,
  createDatabase,
  runMigrations,
  schema,
  withScope,
} from "../../src/index.js";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error("TEST_DATABASE_URL must be set for integration tests (see .env.example).");

const owner = createDatabase({ url });
const app = createDatabase({ url, role: APPLICATION_ROLE });
const { users, organizations, memberships, agents, permissionGrants, consents } = schema;

async function expectRefused(
  promise: Promise<unknown>,
  pattern = /row-level security|permission denied/,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "expected the database to refuse").toBeInstanceOf(Error);
  const messages: string[] = [];
  for (let e: unknown = error; e instanceof Error; e = e.cause) messages.push(e.message);
  expect(messages.join(" | ")).toMatch(pattern);
}

const ids = {
  admin: randomUUID(),
  member: randomUUID(),
  outsider: randomUUID(),
  org: randomUUID(),
  other: randomUUID(),
  memberAgent: randomUUID(),
};
const tag = ids.org.slice(0, 8);
const as = (userId: string, tenantId = ids.org) => ({ userId, tenantId });

beforeAll(async () => {
  await runMigrations(owner);
  await owner.db.insert(users).values([
    { id: ids.admin, name: "Admin", email: `admin-${tag}@example.test`, emailVerified: true },
    { id: ids.member, name: "Member", email: `member-${tag}@example.test`, emailVerified: true },
    {
      id: ids.outsider,
      name: "Outsider",
      email: `outsider-${tag}@example.test`,
      emailVerified: true,
    },
  ]);
  await owner.db.insert(organizations).values([
    { id: ids.org, name: "Org", slug: `org-${tag}`, createdBy: ids.admin },
    { id: ids.other, name: "Other", slug: `other-${tag}`, createdBy: ids.outsider },
  ]);
  await owner.db.insert(memberships).values([
    { tenantId: ids.org, userId: ids.admin, role: "owner" },
    { tenantId: ids.org, userId: ids.member, role: "member" },
    { tenantId: ids.other, userId: ids.outsider, role: "owner" },
  ]);
});

afterAll(async () => {
  await owner.db
    .delete(organizations)
    .where(sql`${organizations.id} in (${ids.org}, ${ids.other})`);
  await owner.db
    .delete(users)
    .where(sql`${users.id} in (${ids.admin}, ${ids.member}, ${ids.outsider})`);
  await Promise.all([owner.close(), app.close()]);
});

describe("agents", () => {
  it("a member registers an agent they own, never one owned by someone else", async () => {
    await withScope(app.db, as(ids.member), (tx) =>
      tx.insert(agents).values({
        id: ids.memberAgent,
        tenantId: ids.org,
        name: "Helper",
        ownerUserId: ids.member,
      }),
    );
    await expectRefused(
      withScope(app.db, as(ids.member), (tx) =>
        tx.insert(agents).values({ tenantId: ids.org, name: "Impostor", ownerUserId: ids.admin }),
      ),
    );
  });

  it("outsiders cannot see or register agents in the organization", async () => {
    const seen = await withScope(app.db, as(ids.outsider), (tx) =>
      tx.select().from(agents).where(eq(agents.tenantId, ids.org)),
    );
    expect(seen).toEqual([]);
    await expectRefused(
      withScope(app.db, as(ids.outsider), (tx) =>
        tx
          .insert(agents)
          .values({ tenantId: ids.org, name: "Intruder", ownerUserId: ids.outsider }),
      ),
    );
  });

  it("agents cannot be deleted by the application", async () => {
    await expectRefused(
      withScope(app.db, as(ids.admin), (tx) =>
        tx.delete(agents).where(eq(agents.id, ids.memberAgent)),
      ),
    );
  });
});

describe("permission grants", () => {
  it("only owners and admins create grants, only for subjects in their organization", async () => {
    const base = {
      tenantId: ids.org,
      effect: "allow" as const,
      resourceType: "audit_log",
      actions: ["read"],
    };
    await withScope(app.db, as(ids.admin), (tx) =>
      tx
        .insert(permissionGrants)
        .values({ ...base, subjectType: "user", subjectId: ids.member, createdBy: ids.admin }),
    );
    await expectRefused(
      withScope(app.db, as(ids.member), (tx) =>
        tx
          .insert(permissionGrants)
          .values({ ...base, subjectType: "user", subjectId: ids.member, createdBy: ids.member }),
      ),
    );
    // Subject from another organization.
    await expectRefused(
      withScope(app.db, as(ids.admin), (tx) =>
        tx
          .insert(permissionGrants)
          .values({ ...base, subjectType: "user", subjectId: ids.outsider, createdBy: ids.admin }),
      ),
    );
  });

  it("ownership-level admin can never be granted, even by the owner", async () => {
    for (const resourceType of ["organization", "*"])
      await expectRefused(
        withScope(app.db, as(ids.admin), (tx) =>
          tx.insert(permissionGrants).values({
            tenantId: ids.org,
            subjectType: "user",
            subjectId: ids.member,
            effect: "allow",
            resourceType,
            actions: ["admin"],
            createdBy: ids.admin,
          }),
        ),
      );
  });

  it("members see only grants about themselves and their agents; grants are revoked, never edited", async () => {
    await withScope(app.db, as(ids.admin), (tx) =>
      tx.insert(permissionGrants).values({
        tenantId: ids.org,
        subjectType: "agent",
        subjectId: ids.memberAgent,
        effect: "deny",
        resourceType: "*",
        actions: ["export"],
        createdBy: ids.admin,
      }),
    );
    const mine = await withScope(app.db, as(ids.member), (tx) =>
      tx.select().from(permissionGrants),
    );
    expect(mine.map((g) => g.subjectType).sort()).toEqual(["agent", "user"]);
    await expectRefused(
      withScope(app.db, as(ids.admin), (tx) =>
        tx
          .update(permissionGrants)
          .set({ actions: ["read", "write"] })
          .where(eq(permissionGrants.tenantId, ids.org)),
      ),
    );
    const revoked = await withScope(app.db, as(ids.member), (tx) =>
      tx
        .update(permissionGrants)
        .set({ revokedAt: new Date(), revokedBy: ids.member })
        .where(eq(permissionGrants.tenantId, ids.org))
        .returning(),
    );
    expect(revoked, "a member cannot revoke grants").toEqual([]);
    await expectRefused(withScope(app.db, as(ids.admin), (tx) => tx.delete(permissionGrants)));
  });
});

describe("consents", () => {
  it("a person gives and revokes only their own consent; revocation is final", async () => {
    const [given] = await withScope(app.db, as(ids.member), (tx) =>
      tx
        .insert(consents)
        .values({
          tenantId: ids.org,
          subjectType: "user",
          userId: ids.member,
          purpose: "telemetry_collection",
          policyVersion: "2026-11-22",
          grantedBy: ids.member,
        })
        .returning(),
    );
    await expectRefused(
      withScope(app.db, as(ids.admin), (tx) =>
        tx.insert(consents).values({
          tenantId: ids.org,
          subjectType: "user",
          userId: ids.member,
          purpose: "identity_directory",
          policyVersion: "1",
          grantedBy: ids.admin,
        }),
      ),
    );
    const adminView = await withScope(app.db, as(ids.admin), (tx) =>
      tx.select().from(consents).where(eq(consents.subjectType, "user")),
    );
    expect(adminView, "personal consents are private to the person").toEqual([]);
    const byAdmin = await withScope(app.db, as(ids.admin), (tx) =>
      tx
        .update(consents)
        .set({ revokedAt: new Date(), revokedBy: ids.admin })
        .where(eq(consents.id, given!.id))
        .returning(),
    );
    expect(byAdmin).toEqual([]);
    await withScope(app.db, as(ids.member), (tx) =>
      tx
        .update(consents)
        .set({ revokedAt: new Date(), revokedBy: ids.member })
        .where(eq(consents.id, given!.id)),
    );
    const again = await withScope(app.db, as(ids.member), (tx) =>
      tx.update(consents).set({ revokedAt: null }).where(eq(consents.id, given!.id)).returning(),
    );
    expect(again, "a revoked consent cannot be reinstated").toEqual([]);
    await expectRefused(
      withScope(app.db, as(ids.member), (tx) =>
        tx.update(consents).set({ purpose: "data_sharing" }).where(eq(consents.id, given!.id)),
      ),
    );
  });

  it("organization policies are set by owners and admins only", async () => {
    await expectRefused(
      withScope(app.db, as(ids.member), (tx) =>
        tx.insert(consents).values({
          tenantId: ids.org,
          subjectType: "organization",
          purpose: "cross_org_policy",
          scopeKey: ids.other,
          policyVersion: "1",
          grantedBy: ids.member,
        }),
      ),
    );
    await withScope(app.db, as(ids.admin), (tx) =>
      tx.insert(consents).values({
        tenantId: ids.org,
        subjectType: "organization",
        purpose: "cross_org_policy",
        scopeKey: ids.other,
        policyVersion: "1",
        grantedBy: ids.admin,
      }),
    );
    const seenByMember = await withScope(app.db, as(ids.member), (tx) =>
      tx.select().from(consents).where(eq(consents.subjectType, "organization")),
    );
    expect(seenByMember).toHaveLength(1);
    const seenByOutsider = await withScope(app.db, as(ids.outsider, ids.org), (tx) =>
      tx.select().from(consents),
    );
    expect(seenByOutsider).toEqual([]);
  });
});
