// Phase 06: the canonical domain schema against a real PostgreSQL. Foreign keys,
// uniqueness, forbidden edges, orphan prevention, row-level security and the
// audit chain, as the application role unless a test says otherwise.
import { randomUUID } from "node:crypto";
import { RELATION_RULES, newId } from "@originos/contracts";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APPLICATION_ROLE, createDatabase, schema, withScope } from "../../src/index.js";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error("TEST_DATABASE_URL must be set for integration tests (see .env.example).");

const owner = createDatabase({ url });
const app = createDatabase({ url, role: APPLICATION_ROLE });
const s = schema;

/** Error messages along the cause chain (drizzle wraps pg errors). */
async function failure(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "expected the database to refuse").toBeInstanceOf(Error);
  const parts: string[] = [];
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    parts.push(e.message);
    const detail = (e as { constraint?: string }).constraint;
    if (detail) parts.push(`constraint ${detail}`);
  }
  return parts.join(" | ");
}

const ids = {
  alice: randomUUID(),
  bob: randomUUID(),
  outsider: randomUUID(),
  org: randomUUID(),
  other: randomUUID(),
  agent: randomUUID(),
};
const tag = ids.org.slice(0, 8);
const as = (userId: string, tenantId = ids.org) => ({ userId, tenantId });
const subj = {
  alice: newId("subject"),
  bob: newId("subject"),
  bot: newId("subject"),
  outsider: newId("subject"),
};

beforeAll(async () => {
  await owner.db.insert(s.users).values([
    { id: ids.alice, name: "Alice", email: `alice-${tag}@example.test`, emailVerified: true },
    { id: ids.bob, name: "Bob", email: `bob-${tag}@example.test`, emailVerified: true },
    { id: ids.outsider, name: "Outsider", email: `out-${tag}@example.test`, emailVerified: true },
  ]);
  await owner.db.insert(s.organizations).values([
    { id: ids.org, name: "Lab", slug: `lab-${tag}`, createdBy: ids.alice },
    { id: ids.other, name: "Other", slug: `other-${tag}`, createdBy: ids.outsider },
  ]);
  await owner.db.insert(s.memberships).values([
    { tenantId: ids.org, userId: ids.alice, role: "owner" },
    { tenantId: ids.org, userId: ids.bob, role: "member" },
    { tenantId: ids.other, userId: ids.outsider, role: "owner" },
  ]);
  await owner.db
    .insert(s.agents)
    .values({ id: ids.agent, tenantId: ids.org, name: "Bot", ownerUserId: ids.alice });
  await withScope(app.db, as(ids.alice), (tx) =>
    tx.insert(s.subjects).values([
      { id: subj.alice, tenantId: ids.org, kind: "human", displayName: "Alice", userId: ids.alice },
      { id: subj.bot, tenantId: ids.org, kind: "agent", displayName: "Bot", agentId: ids.agent },
    ]),
  );
  await withScope(app.db, as(ids.bob), (tx) =>
    tx.insert(s.subjects).values({
      id: subj.bob,
      tenantId: ids.org,
      kind: "human",
      displayName: "Bob",
      userId: ids.bob,
    }),
  );
  await withScope(app.db, as(ids.outsider, ids.other), (tx) =>
    tx.insert(s.subjects).values({
      id: subj.outsider,
      tenantId: ids.other,
      kind: "human",
      displayName: "Outsider",
      userId: ids.outsider,
    }),
  );
});

afterAll(async () => {
  // Deleting an organization removes all its domain data, edges included (docs/RETENTION.md).
  await owner.db
    .delete(s.organizations)
    .where(sql`${s.organizations.id} in (${ids.org}, ${ids.other})`);
  await owner.db.delete(s.agents).where(eq(s.agents.id, ids.agent));
  await owner.db
    .delete(s.users)
    .where(sql`${s.users.id} in (${ids.alice}, ${ids.bob}, ${ids.outsider})`);
  const left = await owner.db
    .select()
    .from(s.objects)
    .where(sql`${s.objects.tenantId} in (${ids.org}, ${ids.other})`);
  expect(left).toEqual([]);
  await Promise.all([owner.close(), app.close()]);
});

/** A work with one version, created by Alice. */
async function workWithVersion(versionNumber = 1) {
  const work = newId("work");
  const version = newId("work_version");
  await withScope(app.db, as(ids.alice), async (tx) => {
    await tx.insert(s.works).values({
      id: work,
      tenantId: ids.org,
      title: "Essay",
      ownerSubjectId: subj.alice,
      createdBySubjectId: subj.alice,
    });
    await tx.insert(s.workVersions).values({
      id: version,
      tenantId: ids.org,
      workId: work,
      versionNumber,
      captureMethod: "manual",
      contentHash: "a".repeat(64),
      createdBySubjectId: subj.alice,
    });
  });
  return { work, version };
}

describe("ids and the object registry", () => {
  it("every domain row gets an opaque prefixed id and a registry entry of its kind", async () => {
    const { work, version } = await workWithVersion();
    const rows = await withScope(app.db, as(ids.alice), (tx) =>
      tx
        .select()
        .from(s.objects)
        .where(sql`${s.objects.id} in (${work}, ${version})`),
    );
    expect(rows.map((r) => r.kind).sort()).toEqual(["work", "work_version"]);
    const wrongPrefix = failure(
      withScope(app.db, as(ids.alice), (tx) =>
        tx.insert(s.works).values({
          id: newId("source"),
          tenantId: ids.org,
          title: "x",
          ownerSubjectId: subj.alice,
          createdBySubjectId: subj.alice,
        }),
      ),
    );
    expect(await wrongPrefix).toMatch(/works_id_ck/);
  });
});

describe("foreign keys and uniqueness", () => {
  it("version numbers are unique per work and versions need an existing work", async () => {
    const { work } = await workWithVersion();
    const insertVersion = (workId: string, n: number) =>
      withScope(app.db, as(ids.alice), (tx) =>
        tx.insert(s.workVersions).values({
          tenantId: ids.org,
          workId,
          versionNumber: n,
          captureMethod: "manual",
          createdBySubjectId: subj.alice,
        }),
      );
    expect(await failure(insertVersion(work, 1))).toMatch(/work_versions_number_uq/);
    expect(await failure(insertVersion(newId("work"), 1))).toMatch(/work_versions_work_fk/);
    await insertVersion(work, 2);
  });

  it("references never cross tenants, even as the schema owner", async () => {
    const result = await failure(
      owner.db.insert(s.works).values({
        tenantId: ids.other,
        title: "Cross",
        ownerSubjectId: subj.alice, // a subject of another tenant
        createdBySubjectId: subj.outsider,
      }),
    );
    expect(result).toMatch(/works_owner_fk/);
  });

  it("agent runs require an agent subject, and action idempotency keys are unique", async () => {
    const human = failure(
      withScope(app.db, as(ids.alice), (tx) =>
        tx.insert(s.agentRuns).values({
          tenantId: ids.org,
          agentSubjectId: subj.alice,
          captureMethod: "instrumentation",
          createdBySubjectId: subj.alice,
        }),
      ),
    );
    expect(await human).toMatch(/agent_runs_agent_fk/);
    const run = newId("agent_run");
    await withScope(app.db, as(ids.alice), async (tx) => {
      await tx.insert(s.agentRuns).values({
        id: run,
        tenantId: ids.org,
        agentSubjectId: subj.bot,
        captureMethod: "instrumentation",
        assurance: "agent_action_observed",
        createdBySubjectId: subj.bot,
      });
      await tx.insert(s.toolActions).values({
        tenantId: ids.org,
        runId: run,
        toolName: "github.merge",
        idempotencyKey: `merge-${tag}`,
        captureMethod: "instrumentation",
        createdBySubjectId: subj.bot,
      });
    });
    const again = failure(
      withScope(app.db, as(ids.alice), (tx) =>
        tx.insert(s.toolActions).values({
          tenantId: ids.org,
          runId: run,
          toolName: "github.merge",
          idempotencyKey: `merge-${tag}`,
          captureMethod: "instrumentation",
          createdBySubjectId: subj.bot,
        }),
      ),
    );
    expect(await again).toMatch(/tool_actions_idempotency_uq/);
  });

  it("an inferred fact never carries an assurance label", async () => {
    const result = failure(
      withScope(app.db, as(ids.alice), (tx) =>
        tx.insert(s.claims).values({
          tenantId: ids.org,
          statement: "Model says so",
          captureMethod: "inferred",
          assurance: "research_claim_assessed",
          createdBySubjectId: subj.alice,
        }),
      ),
    );
    expect(await result).toMatch(/claims_inferred_unlabeled_ck/);
  });
});

describe("typed relations", () => {
  it("the database whitelist matches RELATION_RULES in contracts", async () => {
    const rows = await owner.db.select().from(s.relationRules);
    const db = rows.map((r) => `${r.type}:${r.fromKind}:${r.toKind}`).sort();
    expect(db).toEqual(RELATION_RULES.map((r) => r.join(":")).sort());
  });

  it("allowed edges are stored; forbidden types, wrong kinds and missing objects are refused", async () => {
    const a = await workWithVersion();
    const b = await workWithVersion();
    const edge = (type: string, fromId: string, fromKind: string, toId: string, toKind: string) =>
      withScope(app.db, as(ids.alice), (tx) =>
        tx.insert(s.relations).values({
          tenantId: ids.org,
          type,
          fromId,
          fromKind,
          toId,
          toKind,
          captureMethod: "manual",
          createdBySubjectId: subj.alice,
        }),
      );
    await edge("DERIVED_FROM", b.version, "work_version", a.version, "work_version");
    expect(await failure(edge("SUPPORTS", a.work, "work", subj.alice, "subject"))).toMatch(
      /relations_rule_fk/,
    );
    // Claiming the wrong kind for an existing object is refused too.
    expect(await failure(edge("CITES", a.version, "work_version", b.version, "source"))).toMatch(
      /relations_to_fk/,
    );
    expect(
      await failure(
        edge("DERIVED_FROM", a.version, "work_version", newId("work_version"), "work_version"),
      ),
    ).toMatch(/relations_to_fk/);
    expect(
      await failure(edge("DERIVED_FROM", a.version, "work_version", a.version, "work_version")),
    ).toMatch(/relations_no_self_ck/);
    expect(
      await failure(edge("DERIVED_FROM", b.version, "work_version", a.version, "work_version")),
    ).toMatch(/relations_live_uq/);
  });

  it("orphans are impossible: an object with edges cannot be deleted, even by the owner", async () => {
    const a = await workWithVersion();
    const b = await workWithVersion();
    await withScope(app.db, as(ids.alice), (tx) =>
      tx.insert(s.relations).values({
        tenantId: ids.org,
        type: "DERIVED_FROM",
        fromId: b.version,
        fromKind: "work_version",
        toId: a.version,
        toKind: "work_version",
        captureMethod: "manual",
        createdBySubjectId: subj.alice,
      }),
    );
    expect(
      await failure(owner.db.delete(s.workVersions).where(eq(s.workVersions.id, a.version))),
    ).toMatch(/relations_to_fk/);
  });

  it("inferred edges must carry a review state", async () => {
    const a = await workWithVersion();
    const b = await workWithVersion();
    const result = failure(
      withScope(app.db, as(ids.alice), (tx) =>
        tx.insert(s.relations).values({
          tenantId: ids.org,
          type: "DERIVED_FROM",
          fromId: b.version,
          fromKind: "work_version",
          toId: a.version,
          toKind: "work_version",
          captureMethod: "inferred",
          createdBySubjectId: subj.alice,
        }),
      ),
    );
    expect(await result).toMatch(/relations_review_ck/);
  });
});

describe("row-level security", () => {
  it("other organizations see nothing and cannot write into this one", async () => {
    await workWithVersion();
    const seen = await withScope(app.db, as(ids.outsider, ids.org), (tx) =>
      tx.select().from(s.works),
    );
    expect(seen).toEqual([]);
    const write = failure(
      withScope(app.db, as(ids.outsider, ids.org), (tx) =>
        tx.insert(s.works).values({
          tenantId: ids.org,
          title: "x",
          ownerSubjectId: subj.alice,
          createdBySubjectId: subj.alice,
        }),
      ),
    );
    expect(await write).toMatch(/row-level security/);
  });

  it("rows can only be attributed to yourself or an agent you own", async () => {
    const asAlice = failure(
      withScope(app.db, as(ids.bob), (tx) =>
        tx.insert(s.works).values({
          tenantId: ids.org,
          title: "x",
          ownerSubjectId: subj.bob,
          createdBySubjectId: subj.alice,
        }),
      ),
    );
    expect(await asAlice).toMatch(/row-level security/);
    const asBot = failure(
      withScope(app.db, as(ids.bob), (tx) =>
        tx.insert(s.works).values({
          tenantId: ids.org,
          title: "x",
          ownerSubjectId: subj.bob,
          createdBySubjectId: subj.bot,
        }),
      ),
    );
    expect(await asBot).toMatch(/row-level security/);
    // Nobody registers another person as a subject.
    const impostor = failure(
      withScope(app.db, as(ids.bob), (tx) =>
        tx
          .insert(s.subjects)
          .values({ tenantId: ids.org, kind: "human", displayName: "Not me", userId: ids.alice }),
      ),
    );
    expect(await impostor).toMatch(/row-level security|subjects_tenant_user_uq/);
  });

  it("private rows are visible only to their creator", async () => {
    const source = newId("source");
    await withScope(app.db, as(ids.alice), (tx) =>
      tx.insert(s.sources).values({
        id: source,
        tenantId: ids.org,
        kind: "web",
        title: "Private notes",
        visibility: "private",
        captureMethod: "manual",
        createdBySubjectId: subj.alice,
      }),
    );
    const bobSees = await withScope(app.db, as(ids.bob), (tx) =>
      tx.select().from(s.sources).where(eq(s.sources.id, source)),
    );
    expect(bobSees).toEqual([]);
    const aliceSees = await withScope(app.db, as(ids.alice), (tx) =>
      tx.select().from(s.sources).where(eq(s.sources.id, source)),
    );
    expect(aliceSees).toHaveLength(1);
  });

  it("facts are immutable and nothing is deleted by the application; state changes are allowed", async () => {
    const { work, version } = await workWithVersion();
    expect(
      await failure(
        withScope(app.db, as(ids.alice), (tx) =>
          tx
            .update(s.workVersions)
            .set({ contentHash: "b".repeat(64) })
            .where(eq(s.workVersions.id, version)),
        ),
      ),
    ).toMatch(/permission denied/);
    expect(
      await failure(
        withScope(app.db, as(ids.alice), (tx) => tx.delete(s.works).where(eq(s.works.id, work))),
      ),
    ).toMatch(/permission denied/);
    const revoked = await withScope(app.db, as(ids.alice), (tx) =>
      tx
        .update(s.workVersions)
        .set({ revokedAt: new Date() })
        .where(eq(s.workVersions.id, version))
        .returning(),
    );
    expect(revoked).toHaveLength(1);
  });
});

describe("audit ledger", () => {
  it("events form a per-tenant hash chain, and tampering is detected", async () => {
    for (const action of ["test.one", "test.two", "test.three"])
      await withScope(app.db, as(ids.alice), (tx) =>
        tx.insert(s.auditEvents).values({
          tenantId: ids.org,
          actorUserId: ids.alice,
          action,
          targetType: "test",
          targetId: tag,
        }),
      );
    const chain = await owner.db
      .select()
      .from(s.auditEvents)
      .where(eq(s.auditEvents.tenantId, ids.org))
      .orderBy(s.auditEvents.seq);
    expect(chain.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(chain[1]?.prevHash).toBe(chain[0]?.hash);
    const verify = async () =>
      (
        await owner.db.execute<{ broken: string | null }>(
          sql`select core.verify_audit_chain(${ids.org}) as broken`,
        )
      ).rows[0]?.broken;
    expect(await verify()).toBeNull();
    // Only the schema owner could do this; the application role cannot update audit events at all.
    await owner.db
      .update(s.auditEvents)
      .set({ action: "test.forged" })
      .where(eq(s.auditEvents.id, chain[1]!.id));
    expect(Number(await verify())).toBe(2);
    await owner.db
      .update(s.auditEvents)
      .set({ action: "test.two" })
      .where(eq(s.auditEvents.id, chain[1]!.id));
    expect(await verify()).toBeNull();
    // Swapping in a different actor is tampering too.
    await owner.db
      .update(s.auditEvents)
      .set({ actorUserId: ids.bob })
      .where(eq(s.auditEvents.id, chain[2]!.id));
    expect(Number(await verify())).toBe(3);
    await owner.db
      .update(s.auditEvents)
      .set({ actorUserId: ids.alice })
      .where(eq(s.auditEvents.id, chain[2]!.id));
    expect(await verify()).toBeNull();
  });

  it("erasing a person keeps the chain verifiable (the chain holds a digest, not the user id)", async () => {
    const erased = randomUUID();
    await owner.db.insert(s.users).values({
      id: erased,
      name: "Leaver",
      email: `leaver-${tag}@example.test`,
      emailVerified: true,
    });
    await owner.db.insert(s.auditEvents).values({
      tenantId: ids.other,
      actorUserId: erased,
      action: "test.left",
      targetType: "test",
      targetId: tag,
    });
    await owner.db.delete(s.users).where(eq(s.users.id, erased)); // actor_user_id → null
    const [event] = await owner.db
      .select()
      .from(s.auditEvents)
      .where(eq(s.auditEvents.tenantId, ids.other));
    expect(event?.actorUserId).toBeNull();
    expect(event?.actorDigest).toMatch(/^[0-9a-f]{64}$/);
    const result = await owner.db.execute<{ broken: string | null }>(
      sql`select core.verify_audit_chain(${ids.other}) as broken`,
    );
    expect(result.rows[0]?.broken).toBeNull();
  });
});
