// Phase 09 acceptance (API and database): a verified domain needs a passed
// challenge, reviewer actions are recorded, revoked and stale proofs are
// labeled, and pseudonymous profiles never expose legal identity. Also:
// account proofs through OAuth (fake provider, test-only), ownership
// recovery, moderation, and tenant isolation.
import { randomUUID } from "node:crypto";
import {
  type Connect,
  generateKeySpec,
  parseKeyring,
  testProviderDefinition,
} from "@originos/connect";
import { FAKE_TOKEN_PREFIX, type FakeProvider, startFakeProvider } from "@originos/connect/testing";
import { newEventId, newId } from "@originos/contracts";
import { APPLICATION_ROLE, type Database, createDatabase, schema, withScope } from "@originos/db";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type Harness, invitationToken, startHarness, uniqueEmail } from "./helpers.js";

let h: Harness;
let fake: FakeProvider;
let app: Database;
const PROVIDER = "test-provider";
const LEGAL_NAME = "Rosalind Legalname";

beforeAll(async () => {
  fake = await startFakeProvider({
    clientId: "originos-test",
    clientSecret: "client-secret-test-only",
  });
  const connect: Connect = {
    keyring: parseKeyring(generateKeySpec("k1")),
    providers: [
      {
        definition: testProviderDefinition(fake.url),
        clientId: "originos-test",
        clientSecret: "client-secret-test-only",
        webhookSecret: null,
        missing: [],
      },
    ],
  };
  h = await startHarness({
    connect,
    logLevel: "error",
    logDestination: { write: (l) => void (process.env.DBG && process.stderr.write(l)) },
  });
  app = createDatabase({ url: process.env.TEST_DATABASE_URL!, role: APPLICATION_ROLE });
});
afterAll(async () => {
  await app?.close();
  await h?.close();
  await fake?.close();
});

type Json = Record<string, unknown>;
const json = <T = Json>(r: { body: string }) => JSON.parse(r.body) as T;
const handle = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

interface Org {
  owner: Client;
  tenantId: string;
}

async function org(name = "Identity Lab", ownerName = "Owner Person"): Promise<Org> {
  const owner = await new Client(h).signUp(uniqueEmail("owner"), undefined, ownerName);
  const res = await owner.request("POST", "/v1/organizations", { name });
  expect(res.statusCode, res.body).toBe(201);
  return { owner, tenantId: String(json(res).organizationId) };
}

async function join(o: Org, role: "admin" | "member", name = "Member Person"): Promise<Client> {
  const email = uniqueEmail(role);
  const res = await o.owner.request("POST", "/v1/organization/invitations", { email, role });
  expect(res.statusCode, res.body).toBe(201);
  const c = await new Client(h).signUp(email, undefined, name);
  const accepted = await c.request("POST", "/v1/invitations/accept", {
    token: invitationToken(h.mailer, email),
  });
  expect(accepted.statusCode, accepted.body).toBe(200);
  return c;
}

async function createProfile(c: Client, body: Json = {}): Promise<Json> {
  const res = await c.request("POST", "/v1/profiles", {
    kind: "creator",
    handle: handle("creator"),
    displayName: "Quill",
    visibility: "public",
    ...body,
  });
  expect(res.statusCode, res.body).toBe(201);
  return json<{ profile: Json }>(res).profile;
}

async function startDomain(c: Client, profileId: string, domain: string, method = "dns_txt") {
  const res = await c.request("POST", `/v1/profiles/${profileId}/proofs/domain`, {
    domain,
    method,
  });
  expect(res.statusCode, res.body).toBe(201);
  return json(res);
}

/** What the worker does after its lookup (the worker suite runs the real job). */
async function recordCheck(proofId: string, ok: boolean, detail = "No TXT record was found.") {
  const r = await h.owner.db.execute<{ status: string }>(
    sql`select trust.record_domain_check(${proofId}, ${ok}, 'dns_txt_record', ${ok ? null : detail},
      ${newId("identity_claim")}, ${newEventId()}, 'test') as status`,
  );
  return r.rows[0]!.status;
}

const detail = async (c: Client, profileId: string) => {
  const res = await c.request("GET", `/v1/profiles/${profileId}`);
  expect(res.statusCode, res.body).toBe(200);
  return json<{ profile: Json; proofs: Json[]; badges: Json[]; reviews: Json[] }>(res);
};

const publicPage = (handleName: string) =>
  new Client(h).request("GET", `/v1/public/profiles/${handleName}`);

/** The database refused it, for the stated reason (not some unrelated error). */
async function refused(work: Promise<unknown>, reason: RegExp) {
  const error = await work.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "expected the database to refuse").not.toBeNull();
  const messages: string[] = [];
  for (
    let e = error as { message?: string; cause?: unknown } | undefined;
    e;
    e = e.cause as typeof e
  )
    messages.push(String(e.message));
  expect(messages.join(" | ")).toMatch(reason);
}

async function userId(c: Client): Promise<string> {
  const res = await c.request("GET", "/api/auth/get-session");
  return String((json(res).user as Json).id);
}

describe("profiles and privacy", () => {
  it("a pseudonymous public profile never exposes the account's legal name, email or ids", async () => {
    const email = uniqueEmail("pseudo");
    const owner = await new Client(h).signUp(email, undefined, LEGAL_NAME);
    const created = await owner.request("POST", "/v1/organizations", { name: "Pen Names Ltd" });
    expect(created.statusCode).toBe(201);
    const p = await createProfile(owner, {
      displayName: "Night Owl",
      pseudonymous: true,
      bio: "Essays.",
    });
    expect(p).toMatchObject({ isMine: true, canManage: true, pseudonymous: true });

    const res = await publicPage(String(p.handle));
    expect(res.statusCode).toBe(200);
    expect(json(res)).toMatchObject({ displayName: "Night Owl", pseudonymous: true, badges: [] });
    for (const leak of [LEGAL_NAME, email, await userId(owner), "Pen Names Ltd", "sub_", "prf_"])
      expect(res.body).not.toContain(leak);
    // The subject that attributes their work carries the pseudonym, not the account name.
    const [subject] = await h.owner.db
      .select({ name: schema.subjects.displayName })
      .from(schema.subjects)
      .innerJoin(schema.profiles, eq(schema.profiles.subjectId, schema.subjects.id))
      .where(eq(schema.profiles.id, String(p.id)));
    expect(subject?.name).toBe("Night Owl");
  });

  it("only public, active profiles have a public page; handles are global and some are reserved", async () => {
    const a = await org();
    const p = await createProfile(a.owner, { visibility: "tenant" });
    expect((await publicPage(String(p.handle))).statusCode).toBe(404);
    expect((await publicPage("NOT a handle")).statusCode).toBe(404);

    const b = await org("Other Org");
    const taken = await b.owner.request("POST", "/v1/profiles", {
      kind: "creator",
      handle: p.handle,
      displayName: "Copycat",
    });
    expect(taken.statusCode).toBe(409);
    expect(json(taken).error).toBe("handle_taken");
    const reserved = await b.owner.request("POST", "/v1/profiles", {
      kind: "creator",
      handle: "verified",
      displayName: "X",
    });
    expect(json(reserved).error).toBe("handle_reserved");
    // Another organization cannot see or touch this profile.
    expect((await b.owner.request("GET", `/v1/profiles/${p.id}`)).statusCode).toBe(404);
    expect(
      (await b.owner.request("PATCH", `/v1/profiles/${p.id}`, { displayName: "Hijack" }))
        .statusCode,
    ).toBe(404);
  });

  it("private profiles are hidden from other members; members cannot create the organization profile", async () => {
    const o = await org();
    const member = await join(o, "member");
    const mine = await createProfile(member, { visibility: "private" });
    const other = await join(o, "member", "Second Member");
    expect((await other.request("GET", `/v1/profiles/${mine.id}`)).statusCode).toBe(404);
    expect((await o.owner.request("GET", `/v1/profiles/${mine.id}`)).statusCode).toBe(200);
    const orgProfile = await member.request("POST", "/v1/profiles", {
      kind: "organization",
      handle: handle("org"),
      displayName: "Lab",
    });
    expect(orgProfile.statusCode).toBe(403);
    const ok = await o.owner.request("POST", "/v1/profiles", {
      kind: "organization",
      handle: handle("org"),
      displayName: "Identity Lab",
      visibility: "public",
    });
    expect(ok.statusCode, ok.body).toBe(201);
    expect(json<{ profile: Json }>(ok).profile).toMatchObject({
      kind: "organization",
      isMine: false,
    });
  });
});

describe("domain proofs: verified only by a passed challenge", () => {
  it("issues a challenge, stays pending on self-report, and verifies only through the worker's check", async () => {
    const o = await org();
    const p = await createProfile(o.owner);
    const proof = await startDomain(o.owner, String(p.id), "Blog.Example.com");
    expect(proof).toMatchObject({ status: "pending", label: "blog.example.com" });
    expect(proof.instructions).toMatchObject({
      method: "dns_txt",
      location: "_originos-challenge.blog.example.com",
    });
    expect(String((proof.instructions as Json).value)).toMatch(/^originos-verify=[a-z2-7]{32}$/);
    expect((await detail(o.owner, String(p.id))).badges).toEqual([]);

    // Self-report is impossible: there is no API to mark it verified, and the
    // database refuses the application role doing it directly.
    const uid = await userId(o.owner);
    await refused(
      withScope(app.db, { userId: uid, tenantId: o.tenantId }, (tx) =>
        tx
          .update(schema.identityProofs)
          .set({
            status: "verified",
            lastVerifiedAt: new Date(),
            expiresAt: new Date(Date.now() + 1e9),
          })
          .where(eq(schema.identityProofs.id, String(proof.id))),
      ),
      /domain proofs are verified only by a successful challenge check/,
    );
    await refused(
      withScope(app.db, { userId: uid, tenantId: o.tenantId }, (tx) =>
        tx.insert(schema.identityProofs).values({
          tenantId: o.tenantId,
          profileId: String(p.id),
          kind: "domain",
          method: "dns_txt",
          target: "forged.example.com",
          label: "forged.example.com",
          challenge: "x",
          status: "verified",
          lastVerifiedAt: new Date(),
          expiresAt: new Date(Date.now() + 1e9),
          claimId: null,
          createdByUserId: uid,
        }),
      ),
      /row-level security|identity_proofs_verified_ck/,
    );

    // Asking for a check queues a worker job; a failed lookup keeps it pending with the reason.
    const check = await o.owner.request(
      "POST",
      `/v1/profiles/${p.id}/proofs/${proof.id}/check`,
      {},
    );
    expect(check.statusCode).toBe(202);
    expect(await recordCheck(String(proof.id), false)).toBe("pending");
    let d = await detail(o.owner, String(p.id));
    expect(d.proofs[0]).toMatchObject({
      status: "pending",
      lastCheckError: "No TXT record was found.",
    });
    expect(d.badges).toEqual([]);

    // A passed challenge verifies it and records a canonical identity claim.
    expect(await recordCheck(String(proof.id), true)).toBe("verified");
    d = await detail(o.owner, String(p.id));
    expect(d.badges).toEqual([
      expect.objectContaining({
        assurance: "domain_or_account_controlled",
        label: "Controls blog.example.com",
        state: "current",
      }),
    ]);
    const [claim] = await h.owner.db
      .select()
      .from(schema.identityClaims)
      .where(eq(schema.identityClaims.value, "blog.example.com"))
      .orderBy(sql`created_at desc`)
      .limit(1);
    expect(claim).toMatchObject({
      captureMethod: "challenge",
      validationMechanism: "dns_txt_record",
      assurance: "domain_or_account_controlled",
      claimType: "domain_control",
    });
    expect(claim?.limitations).toMatch(/does not show legal ownership/);
    const pub = json<{ badges: Json[] }>(await publicPage(String(p.handle)));
    expect(pub.badges[0]).toMatchObject({ label: "Controls blog.example.com", state: "current" });
  });

  it("refuses non-public domains and duplicate live proofs", async () => {
    const o = await org();
    const p = await createProfile(o.owner);
    for (const domain of ["localhost", "10.0.0.1", "router.local", "https://x.com/path"]) {
      const res = await o.owner.request("POST", `/v1/profiles/${p.id}/proofs/domain`, {
        domain,
        method: "html_file",
      });
      expect(res.statusCode, domain).toBe(400);
      expect(json(res).error).toBe("invalid_domain");
    }
    await startDomain(o.owner, String(p.id), "dup.example.com");
    const again = await o.owner.request("POST", `/v1/profiles/${p.id}/proofs/domain`, {
      domain: "dup.example.com",
      method: "html_file",
    });
    expect(json(again).error).toBe("proof_exists");
  });
});

describe("revoked, stale and expired proofs are labeled", () => {
  it("a failed re-check makes a proof stale, another profile proving it marks control moved, expiry is shown, withdrawal is final", async () => {
    const o = await org();
    const p = await createProfile(o.owner);
    const proof = await startDomain(o.owner, String(p.id), "stale.example.com");
    await recordCheck(String(proof.id), true);

    expect(await recordCheck(String(proof.id), false, "No TXT record was found.")).toBe("stale");
    let badge = (await detail(o.owner, String(p.id))).badges[0]!;
    expect(badge).toMatchObject({ state: "stale" });
    expect(String(badge.stateNote)).toMatch(
      /^The re-check on \d{4}-\d{2}-\d{2} failed: No TXT record/,
    );
    let pub = json<{ badges: Json[] }>(await publicPage(String(p.handle)));
    expect(pub.badges[0]).toMatchObject({ state: "stale" });

    // Passing again restores it; then another organization's profile proves the same domain.
    expect(await recordCheck(String(proof.id), true)).toBe("verified");
    const b = await org("Elsewhere");
    const q = await createProfile(b.owner);
    const theirs = await startDomain(b.owner, String(q.id), "stale.example.com");
    await recordCheck(String(theirs.id), true);
    badge = (await detail(o.owner, String(p.id))).badges[0]!;
    expect(badge.state).toBe("stale");
    expect(String(badge.stateNote)).toMatch(
      /Another profile proved control of stale\.example\.com.*Control may have changed/,
    );

    // Expiry is computed on read: past expires_at the badge says expired, never current.
    const fresh = await startDomain(o.owner, String(p.id), "expired.example.com");
    await recordCheck(String(fresh.id), true);
    await h.owner.db
      .update(schema.identityProofs)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.identityProofs.id, String(fresh.id)));
    const expired = (await detail(o.owner, String(p.id))).badges.find((x) => x.id === fresh.id)!;
    expect(expired).toMatchObject({ state: "expired" });
    expect(String(expired.stateNote)).toMatch(/expired on/);

    // Withdrawal: labeled revoked, the claim is revoked, and nobody can un-revoke it.
    const revoke = await o.owner.request(
      "POST",
      `/v1/profiles/${p.id}/proofs/${fresh.id}/revoke`,
      {},
    );
    expect(revoke.statusCode).toBe(200);
    expect(json(revoke)).toMatchObject({ status: "revoked", revokedReason: "withdrawn" });
    pub = json<{ badges: Json[] }>(await publicPage(String(p.handle)));
    expect(pub.badges.find((x) => x.id === fresh.id)).toMatchObject({
      state: "revoked",
      stateNote: expect.stringMatching(/^Withdrawn by the profile's owner on/),
    });
    await refused(
      h.owner.db
        .update(schema.identityProofs)
        .set({ status: "verified", revokedAt: null, revokedReason: null })
        .where(eq(schema.identityProofs.id, String(fresh.id))),
      /a revoked proof stays revoked/,
    );
    const [row] = await h.owner.db
      .select({ claimId: schema.identityProofs.claimId })
      .from(schema.identityProofs)
      .where(eq(schema.identityProofs.id, String(fresh.id)));
    const [claim] = await h.owner.db
      .select({ revokedAt: schema.identityClaims.revokedAt })
      .from(schema.identityClaims)
      .where(eq(schema.identityClaims.id, row!.claimId!));
    expect(claim?.revokedAt).not.toBeNull();
    // Re-checking a revoked proof is refused.
    const recheck = await o.owner.request(
      "POST",
      `/v1/profiles/${p.id}/proofs/${fresh.id}/check`,
      {},
    );
    expect(json(recheck).error).toBe("proof_revoked");
  });
});

describe("account proofs through OAuth", () => {
  async function approve(c: Client, profileId: string) {
    const start = await c.request(
      "POST",
      `/v1/profiles/${profileId}/proofs/account/${PROVIDER}/start`,
      {},
    );
    expect(start.statusCode, start.body).toBe(200);
    const url = new URL(String(json(start).authorizeUrl));
    expect(url.searchParams.get("scope")).toBe("");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/integrations/callback/test-provider/identity",
    );
    const back = new URL(fake.approve(url.toString()));
    return { code: back.searchParams.get("code")!, state: back.searchParams.get("state")! };
  }

  it("a member proves an account; no token is kept; the attempt is single-use and purpose-bound", async () => {
    const o = await org();
    const member = await join(o, "member");
    const p = await createProfile(member);
    const providers = json<Json[]>(await member.request("GET", "/v1/identity/providers"));
    expect(providers).toEqual([
      expect.objectContaining({ id: PROVIDER, configured: true, testOnly: true }),
    ]);

    const a = await approve(member, String(p.id));
    const done = await member.request("POST", "/v1/identity/callback", {
      provider: PROVIDER,
      ...a,
    });
    expect(done.statusCode, done.body).toBe(200);
    expect(json(done)).toMatchObject({
      profileId: p.id,
      proof: { kind: "account", status: "verified", label: "test-user" },
    });
    expect(done.body).not.toContain(FAKE_TOKEN_PREFIX);
    const badges = (await detail(member, String(p.id))).badges;
    expect(badges[0]).toMatchObject({
      label: "Controls the Test provider (local testing only) account test-user",
      assurance: "domain_or_account_controlled",
      state: "current",
    });
    expect(String(badges[0]!.method)).toMatch(/signed in to the provider and authorized OriginOS/);

    // Replays fail; an identity attempt cannot finish an organization connection, nor the reverse.
    const replay = await member.request("POST", "/v1/identity/callback", {
      provider: PROVIDER,
      ...a,
    });
    expect(json(replay).error).toBe("state_used");
    const b = await approve(member, String(p.id));
    const wrong = await o.owner.request("POST", "/v1/connect/callback", {
      provider: PROVIDER,
      ...b,
    });
    expect(json(wrong).error).toBe("invalid_state");
    // Nothing token-like is stored anywhere for identity proofs.
    const stored = await h.owner.db.execute(
      sql`select row_to_json(x)::text as r from trust.identity_proofs x where profile_id = ${String(p.id)}`,
    );
    expect(JSON.stringify(stored.rows)).not.toContain(FAKE_TOKEN_PREFIX);
    // Members cannot start an account proof for someone else's profile.
    const other = await join(o, "member", "Other");
    const deny = await other.request(
      "POST",
      `/v1/profiles/${p.id}/proofs/account/${PROVIDER}/start`,
      {},
    );
    expect(deny.statusCode).toBe(403);
  });
});

describe("review queue: human decisions, recorded", () => {
  it("claims are decided by an owner or admin who did not make them; every action is audited", async () => {
    const o = await org();
    const admin = await join(o, "admin", "Admin Person");
    const member = await join(o, "member");
    const ownerProfile = await createProfile(o.owner);
    const req = await o.owner.request("POST", `/v1/profiles/${ownerProfile.id}/reviews`, {
      kind: "claim",
      claimType: "affiliation",
      statement: "Staff writer at The Daily Example",
      evidence: [{ kind: "url", url: "https://daily.example.com/staff" }],
    });
    expect(req.statusCode, req.body).toBe(201);
    const review = json(req);
    expect(review).toMatchObject({ status: "pending", isMine: true, canDecide: false });
    expect(String(review.evidenceHash)).toMatch(/^[0-9a-f]{64}$/);

    // The requester cannot decide it, even as owner; a member cannot decide anything.
    const self = await o.owner.request("POST", `/v1/identity/reviews/${review.id}/decision`, {
      decision: "approve",
      reason: "Looks right",
    });
    expect(self.statusCode).toBe(403);
    const byMember = await member.request("POST", `/v1/identity/reviews/${review.id}/decision`, {
      decision: "approve",
      reason: "Looks right",
    });
    expect(byMember.statusCode).toBe(403);
    // The database refuses a self-decision even without the API.
    const ownerId = await userId(o.owner);
    await refused(
      withScope(app.db, { userId: ownerId, tenantId: o.tenantId }, (tx) =>
        tx
          .update(schema.identityReviews)
          .set({
            status: "approved",
            decidedByUserId: ownerId,
            decidedAt: new Date(),
            decisionReason: "x",
          })
          .where(eq(schema.identityReviews.id, String(review.id))),
      ),
      /decided by an owner or admin who did not make them/,
    );

    const queue = json<Json[]>(await admin.request("GET", "/v1/identity/reviews"));
    expect(queue.find((r) => r.id === review.id)).toMatchObject({ canDecide: true });
    const decided = await admin.request("POST", `/v1/identity/reviews/${review.id}/decision`, {
      decision: "approve",
      reason: "Staff page lists them",
    });
    expect(decided.statusCode, decided.body).toBe(200);
    expect(json(decided)).toMatchObject({
      status: "approved",
      decidedBy: { name: "Admin Person" },
      decisionReason: "Staff page lists them",
    });
    const badge = (await detail(o.owner, String(ownerProfile.id))).badges[0]!;
    expect(badge).toMatchObject({
      assurance: "identity_reviewed",
      label: "Affiliation: Staff writer at The Daily Example",
      state: "current",
    });
    expect(String(badge.method)).toMatch(/A reviewer at Identity Lab/);
    // Public pages never name the organization (it could locate a pseudonymous creator).
    const pub = await publicPage(String(ownerProfile.handle));
    expect(pub.body).not.toContain("Identity Lab");
    expect(pub.body).not.toContain("daily.example.com/staff");

    // Decisions are not edited afterwards, by anyone in the application role.
    const adminId = await userId(admin);
    await refused(
      withScope(app.db, { userId: adminId, tenantId: o.tenantId }, (tx) =>
        tx
          .update(schema.identityReviews)
          .set({ decisionReason: "Changed my mind" })
          .where(eq(schema.identityReviews.id, String(review.id))),
      ),
      /review decisions are not edited/,
    );
    // Twice is refused.
    const twice = await admin.request("POST", `/v1/identity/reviews/${review.id}/decision`, {
      decision: "reject",
      reason: "No basis",
    });
    expect(json(twice).error).toBe("already_decided");

    // Revoking keeps the decision and labels the badge.
    const revoked = await admin.request("POST", `/v1/identity/reviews/${review.id}/revoke`, {
      reason: "The staff page was removed.",
    });
    expect(json(revoked)).toMatchObject({
      status: "revoked",
      decisionReason: "Staff page lists them",
    });
    expect((await detail(o.owner, String(ownerProfile.id))).badges[0]).toMatchObject({
      state: "revoked",
    });

    const audit = await h.owner.db
      .select({
        action: schema.auditEvents.action,
        actor: schema.auditEvents.actorUserId,
        metadata: schema.auditEvents.metadata,
      })
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.tenantId, o.tenantId),
          eq(schema.auditEvents.targetId, String(review.id)),
        ),
      )
      .orderBy(schema.auditEvents.seq);
    expect(audit.map((a) => [a.action, a.actor])).toEqual([
      ["identity.review_requested", ownerId],
      ["identity.review_decided", adminId],
      ["identity.review_revoked", adminId],
    ]);
    expect(audit[1]!.metadata).toMatchObject({
      decision: "approve",
      evidenceHash: review.evidenceHash,
    });
  });
});

describe("ownership recovery and changed ownership", () => {
  it("a person who lost their account recovers the profile with evidence; the previous owner's proofs end", async () => {
    const o = await org();
    const lost = await join(o, "member", "Old Account");
    const target = await createProfile(lost, { displayName: "Long Running Blog" });
    const oldProof = await startDomain(lost, String(target.id), "recover.example.com");
    await recordCheck(String(oldProof.id), true);

    // The same person, on a new account, proves the domain on a new profile and asks to recover the old one.
    const fresh = await join(o, "member", "New Account");
    const mine = await createProfile(fresh);
    const proof = await startDomain(fresh, String(mine.id), "recover.example.com");
    await recordCheck(String(proof.id), true);
    const asked = await fresh.request("POST", `/v1/profiles/${target.id}/reviews`, {
      kind: "ownership",
      reason: "recovery",
      statement: "I lost access to my old account; I still control recover.example.com.",
    });
    expect(asked.statusCode, asked.body).toBe(201);
    const request = json(asked);
    expect(request.matchingProofs).toEqual([
      { kind: "domain", label: "recover.example.com", requesterHolds: true },
    ]);
    // Asking for your own profile is refused; so is the organization profile.
    const own = await lost.request("POST", `/v1/profiles/${target.id}/reviews`, {
      kind: "ownership",
      reason: "handover",
      statement: "Mine already",
    });
    expect(json(own).error).toBe("already_owner");
    // The previous owner can see the request about their profile.
    expect(
      json<Json[]>(await lost.request("GET", "/v1/identity/reviews")).map((r) => r.id),
    ).toContain(request.id);

    // A profile cannot change owner without an approved request (database guard).
    const freshId = await userId(fresh);
    const [mineRow] = await h.owner.db
      .select({ subjectId: schema.profiles.subjectId })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, String(mine.id)));
    const ownerId = await userId(o.owner);
    await refused(
      withScope(app.db, { userId: ownerId, tenantId: o.tenantId }, (tx) =>
        tx
          .update(schema.profiles)
          .set({ subjectId: mineRow!.subjectId })
          .where(eq(schema.profiles.id, String(target.id))),
      ),
      /changes owner only through an approved ownership request/,
    );

    const approved = await o.owner.request("POST", `/v1/identity/reviews/${request.id}/decision`, {
      decision: "approve",
      reason: "New account proves the same domain today.",
    });
    expect(approved.statusCode, approved.body).toBe(200);
    const after = await detail(fresh, String(target.id));
    expect(after.profile).toMatchObject({ isMine: true, canManage: true });
    expect(after.proofs.find((x) => x.id === oldProof.id)).toMatchObject({
      status: "revoked",
      revokedReason: "ownership_changed",
    });
    expect(after.badges.find((b) => b.id === oldProof.id)).toMatchObject({
      state: "revoked",
      stateNote: expect.stringMatching(/^Ended when the profile changed owner/),
    });
    // The old account no longer manages it.
    const oldView = await lost.request("GET", `/v1/profiles/${target.id}`);
    expect(json<{ profile: Json }>(oldView).profile).toMatchObject({
      canManage: false,
      isMine: false,
    });
    const edit = await lost.request("PATCH", `/v1/profiles/${target.id}`, { displayName: "Mine" });
    expect(edit.statusCode).toBe(403);
    const [changed] = await h.owner.db
      .select({ metadata: schema.auditEvents.metadata, actor: schema.auditEvents.actorUserId })
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.action, "identity.ownership_changed"),
          eq(schema.auditEvents.targetId, String(target.id)),
        ),
      );
    expect(changed).toMatchObject({
      actor: ownerId,
      metadata: { reviewId: request.id, proofsRevoked: 1 },
    });
    expect(freshId).not.toBe(ownerId);
  });
});

describe("moderation", () => {
  it("owners and admins hide or suspend a profile with a reason; hidden profiles leave the public network", async () => {
    const o = await org();
    const member = await join(o, "member");
    const p = await createProfile(member);
    const byMember = await member.request("POST", `/v1/profiles/${p.id}/moderation`, {
      state: "hidden",
      reason: "Spam",
    });
    expect(byMember.statusCode).toBe(403);

    const hidden = await o.owner.request("POST", `/v1/profiles/${p.id}/moderation`, {
      state: "hidden",
      reason: "Impersonation report under review",
    });
    expect(hidden.statusCode, hidden.body).toBe(200);
    expect((await publicPage(String(p.handle))).statusCode).toBe(404);
    // The database refuses a member lifting it themselves.
    const memberId = await userId(member);
    await refused(
      withScope(app.db, { userId: memberId, tenantId: o.tenantId }, (tx) =>
        tx
          .update(schema.profiles)
          .set({ moderationState: "active", moderationReason: null })
          .where(eq(schema.profiles.id, String(p.id))),
      ),
      /only owners and admins moderate profiles/,
    );

    await o.owner.request("POST", `/v1/profiles/${p.id}/moderation`, {
      state: "suspended",
      reason: "Confirmed impersonation",
    });
    const edit = await member.request("PATCH", `/v1/profiles/${p.id}`, { bio: "Still here" });
    expect(json(edit).error).toBe("profile_suspended");
    const proof = await member.request("POST", `/v1/profiles/${p.id}/proofs/domain`, {
      domain: "x.example.com",
      method: "dns_txt",
    });
    expect(json(proof).error).toBe("profile_suspended");
    expect((await detail(member, String(p.id))).profile).toMatchObject({
      moderationState: "suspended",
      moderationReason: "Confirmed impersonation",
    });

    await o.owner.request("POST", `/v1/profiles/${p.id}/moderation`, {
      state: "active",
      reason: "Resolved",
    });
    expect((await publicPage(String(p.handle))).statusCode).toBe(200);
  });
});
