// Audit of Phases 00–09 (0012_audit_guards): rules the API follows are also
// enforced by the database, as the application role, whatever the API does.
import { createHash, randomUUID } from "node:crypto";
import { newId, newProfileId, newProofId } from "@originos/contracts";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APPLICATION_ROLE, createDatabase, schema as s, withScope } from "../../src/index.js";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error("TEST_DATABASE_URL must be set for integration tests (see .env.example).");

const owner = createDatabase({ url });
const app = createDatabase({ url, role: APPLICATION_ROLE });

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
  alice: randomUUID(), // owner
  bob: randomUUID(), // member
  org: randomUUID(),
  other: randomUUID(),
  agent: randomUUID(),
};
const tag = ids.org.slice(0, 8);
const as = (userId: string, tenantId = ids.org) => ({ userId, tenantId });
const subj = { alice: newId("subject"), bob: newId("subject"), bot: newId("subject") };
const run = newId("agent_run");

beforeAll(async () => {
  await owner.db.insert(s.users).values([
    { id: ids.alice, name: "Alice", email: `ga-${tag}@example.test`, emailVerified: true },
    { id: ids.bob, name: "Bob", email: `gb-${tag}@example.test`, emailVerified: true },
  ]);
  await owner.db.insert(s.organizations).values([
    { id: ids.org, name: "Guards", slug: `guards-${tag}`, createdBy: ids.alice },
    { id: ids.other, name: "Guards 2", slug: `guards2-${tag}`, createdBy: ids.alice },
  ]);
  await owner.db.insert(s.memberships).values([
    { tenantId: ids.org, userId: ids.alice, role: "owner" },
    { tenantId: ids.org, userId: ids.bob, role: "member" },
    { tenantId: ids.other, userId: ids.alice, role: "owner" },
  ]);
  await owner.db
    .insert(s.agents)
    .values({ id: ids.agent, tenantId: ids.org, name: "Bot", ownerUserId: ids.alice });
  await owner.db.insert(s.subjects).values([
    { id: subj.alice, tenantId: ids.org, kind: "human", displayName: "Alice", userId: ids.alice },
    { id: subj.bob, tenantId: ids.org, kind: "human", displayName: "Bob", userId: ids.bob },
    { id: subj.bot, tenantId: ids.org, kind: "agent", displayName: "Bot", agentId: ids.agent },
  ]);
  await owner.db.insert(s.agentRuns).values({
    id: run,
    tenantId: ids.org,
    agentSubjectId: subj.bot,
    captureMethod: "instrumentation",
    assurance: "agent_action_observed",
    createdBySubjectId: subj.bot,
  });
});

afterAll(async () => {
  await owner.db
    .delete(s.organizations)
    .where(sql`${s.organizations.id} in (${ids.org}, ${ids.other})`);
  await owner.db.delete(s.agents).where(eq(s.agents.id, ids.agent));
  await owner.db.delete(s.users).where(sql`${s.users.id} in (${ids.alice}, ${ids.bob})`);
  await Promise.all([owner.close(), app.close()]);
});

/** A tool action by the agent with a pending approval. */
async function pendingApproval(createdBy = subj.bot) {
  const action = newId("tool_action");
  const approval = newId("approval");
  await owner.db.insert(s.toolActions).values({
    id: action,
    tenantId: ids.org,
    runId: run,
    toolName: "github.merge",
    idempotencyKey: `merge-${action}`,
    captureMethod: "instrumentation",
    status: "awaiting_approval",
    createdBySubjectId: createdBy,
  });
  await owner.db
    .insert(s.approvals)
    .values({ id: approval, tenantId: ids.org, actionId: action, createdBySubjectId: createdBy });
  return { action, approval };
}

/** A claim row for a proof to point at (proofs past pending need one). */
async function claimFor(subjectId: string) {
  const id = newId("identity_claim");
  await owner.db.insert(s.identityClaims).values({
    id,
    tenantId: ids.org,
    subjectId,
    captureMethod: "challenge",
    assurance: "domain_or_account_controlled",
    claimType: "domain_control",
    value: `c-${id}`,
  });
  return id;
}

const decide = (
  userId: string,
  approval: string,
  decidedBy: string,
  decision: "approved" | "rejected" = "approved",
) =>
  withScope(app.db, as(userId), (tx) =>
    tx
      .update(s.approvals)
      .set({ decision, decidedBySubjectId: decidedBy, decidedAt: sql`now()` })
      .where(eq(s.approvals.id, approval))
      .returning(),
  );

describe("human approvals", () => {
  it("a person decides once, as themselves, never as an agent or someone else", async () => {
    const { approval } = await pendingApproval();
    // Bob cannot decide in Alice's name, and nobody decides as the agent.
    expect(await failure(decide(ids.bob, approval, subj.alice))).toMatch(/decided by a person/);
    expect(await failure(decide(ids.alice, approval, subj.bot))).toMatch(/decided by a person/);
    expect(await decide(ids.bob, approval, subj.bob)).toHaveLength(1);
    // Decided once: it cannot be flipped or reopened.
    expect(await failure(decide(ids.alice, approval, subj.alice, "rejected"))).toMatch(
      /decided once/,
    );
  });

  it("the subject that asked cannot approve its own request, and approvals start pending", async () => {
    const { approval } = await pendingApproval(subj.bob);
    expect(await failure(decide(ids.bob, approval, subj.bob))).toMatch(/who did not ask/);
    const { action } = await pendingApproval();
    expect(
      await failure(
        withScope(app.db, as(ids.alice), (tx) =>
          tx.insert(s.approvals).values({
            tenantId: ids.org,
            actionId: action,
            decision: "approved",
            decidedBySubjectId: subj.alice,
            decidedAt: new Date(),
          }),
        ),
      ),
    ).toMatch(/starts pending/);
  });

  it("a tool action is approved only by an approved approval; finished actions keep their outcome", async () => {
    const { action, approval } = await pendingApproval();
    const setStatus = (status: "approved" | "executed") =>
      withScope(app.db, as(ids.alice), (tx) =>
        tx.update(s.toolActions).set({ status }).where(eq(s.toolActions.id, action)).returning(),
      );
    expect(await failure(setStatus("approved"))).toMatch(/only by an approved approval/);
    await decide(ids.alice, approval, subj.alice);
    expect(await setStatus("approved")).toHaveLength(1);
    expect(await setStatus("executed")).toHaveLength(1);
    expect(await failure(setStatus("approved"))).toMatch(/keeps its outcome/);
  });
});

describe("agents stay in their organization", () => {
  it("an agent subject cannot be created in another organization of the same owner", async () => {
    expect(
      await failure(
        withScope(app.db, as(ids.alice, ids.other), (tx) =>
          tx.insert(s.subjects).values({
            tenantId: ids.other,
            kind: "agent",
            displayName: "Bot elsewhere",
            agentId: ids.agent,
          }),
        ),
      ),
    ).toMatch(/row-level security/);
  });
});

describe("identity claims", () => {
  it("revocation is one-way, and a member cannot end someone else's claim", async () => {
    const claim = newId("identity_claim");
    await owner.db.insert(s.identityClaims).values({
      id: claim,
      tenantId: ids.org,
      subjectId: subj.alice,
      captureMethod: "challenge",
      assurance: "domain_or_account_controlled",
      claimType: "domain_control",
      value: `g-${tag}.example.com`,
    });
    const set = (userId: string, revokedAt: Date | null) =>
      withScope(app.db, as(userId), (tx) =>
        tx
          .update(s.identityClaims)
          .set({ revokedAt })
          .where(eq(s.identityClaims.id, claim))
          .returning(),
      );
    expect(await failure(set(ids.bob, new Date()))).toMatch(/ends a claim/);
    expect(await set(ids.alice, new Date())).toHaveLength(1);
    expect(await failure(set(ids.alice, null))).toMatch(/stays that way/);
  });
});

describe("profiles and proofs", () => {
  const profile = newProfileId();
  beforeAll(async () => {
    await owner.db.insert(s.profiles).values({
      id: profile,
      tenantId: ids.org,
      subjectId: subj.bob,
      kind: "creator",
      handle: `bob-${tag}`,
      displayName: "Bob Writes",
      visibility: "private",
      createdByUserId: ids.bob,
    });
  });

  it("owners and admins moderate a member's creator profile but do not edit it", async () => {
    const update = (userId: string, values: Partial<typeof s.profiles.$inferInsert>) =>
      withScope(app.db, as(userId), (tx) =>
        tx.update(s.profiles).set(values).where(eq(s.profiles.id, profile)).returning(),
      );
    expect(await failure(update(ids.alice, { visibility: "public" }))).toMatch(
      /only the profile's owner changes its content/,
    );
    expect(
      await update(ids.alice, {
        moderationState: "hidden",
        moderationReason: "Reported",
        moderatedAt: new Date(),
        moderatedByUserId: ids.alice,
      }),
    ).toHaveLength(1);
    expect(await update(ids.bob, { displayName: "Bob Writes More" })).toHaveLength(1);
  });

  it("an account proof is recorded only right after its owner signed in for this profile", async () => {
    const claimId = await claimFor(subj.bob);
    const insertProof = () =>
      withScope(app.db, as(ids.bob), (tx) =>
        tx
          .insert(s.identityProofs)
          .values({
            id: newProofId(),
            tenantId: ids.org,
            profileId: profile,
            kind: "account",
            method: "oauth",
            provider: "test-provider",
            target: `test-provider:${tag}`,
            label: "bob",
            status: "verified",
            firstVerifiedAt: new Date(),
            lastVerifiedAt: new Date(),
            expiresAt: new Date(Date.now() + 86_400_000),
            claimId,
            createdByUserId: ids.bob,
          })
          .returning(),
      );
    expect(await failure(insertProof())).toMatch(/only after signing in/);
    // A consumed identity-proof attempt for this profile, by Bob, just now.
    const stateHash = createHash("sha256").update(randomUUID()).digest("hex");
    await owner.db.insert(s.oauthStates).values({
      stateHash,
      tenantId: ids.org,
      userId: ids.bob,
      provider: "test-provider",
      purpose: "identity_proof",
      profileId: profile,
      codeVerifier: "v",
      redirectUri: "http://x",
      scopes: [],
      expiresAt: new Date(Date.now() + 600_000),
      consumedAt: new Date(),
    });
    const [proof] = await insertProof();
    expect(proof?.status).toBe("verified");
    // Alice, an owner, cannot change what Bob's proof shows.
    expect(
      await failure(
        withScope(app.db, as(ids.alice), (tx) =>
          tx
            .update(s.identityProofs)
            .set({ visibility: "tenant" })
            .where(and(eq(s.identityProofs.id, proof!.id))),
        ),
      ),
    ).toMatch(/only the profile's owner changes what its proofs show/);
  });

  it("public pages show a failed re-check without the lookup detail", async () => {
    const pub = newProfileId();
    const proofId = newProofId();
    await owner.db.insert(s.profiles).values({
      id: pub,
      tenantId: ids.org,
      subjectId: subj.alice,
      kind: "creator",
      handle: `alice-${tag}`,
      displayName: "Alice",
      visibility: "public",
      createdByUserId: ids.alice,
    });
    await owner.db.insert(s.identityProofs).values({
      id: proofId,
      tenantId: ids.org,
      profileId: pub,
      kind: "domain",
      method: "dns_txt",
      target: `a-${tag}.example.com`,
      label: `a-${tag}.example.com`,
      challenge: "originos-verify=x",
      status: "stale",
      firstVerifiedAt: new Date(),
      lastVerifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
      claimId: await claimFor(subj.alice),
      staleAt: new Date(),
      staleReason:
        "The re-check on 2026-11-23 failed: The domain resolves to a private or reserved address.",
      createdByUserId: ids.alice,
    });
    const rows = await app.db.execute<{ stale_reason: string }>(
      sql`select stale_reason from trust.public_profile_proofs(${pub})`,
    );
    expect(rows.rows).toEqual([{ stale_reason: "The re-check on 2026-11-23 failed." }]);
  });
});
