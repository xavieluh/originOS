// Phase 04 acceptance checks against a real PostgreSQL (row-level security on)
// through the real HTTP stack: Better Auth + guard + tenancy service.
import { schema } from "@originos/db";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listRoutes } from "../../src/app.js";
import {
  Client,
  type Harness,
  ORIGIN,
  invitationToken,
  startHarness,
  uniqueEmail,
  waitForMail,
} from "./helpers.js";

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

const json = (r: { body: string }) => JSON.parse(r.body) as Record<string, unknown>;

describe("logged-out requests cannot reach private endpoints", () => {
  const PUBLIC = new Set([
    "GET /health/live",
    "GET /health/ready",
    "GET /v1/auth-config",
    "GET /api/auth/*",
    "POST /api/auth/*",
  ]);

  it("the only public routes are health, auth-config and the auth endpoints themselves", () => {
    const routes = listRoutes(h.app).map((r) => `${r.method} ${r.url}`);
    expect(routes.length).toBeGreaterThan(10);
    const privateRoutes = routes.filter((r) => !PUBLIC.has(r));
    expect(privateRoutes.every((r) => r.includes("/v1/"))).toBe(true);
  });

  it("every other route answers 401 without a session", async () => {
    const anonymous = new Client(h);
    const routes = listRoutes(h.app).filter((r) => !PUBLIC.has(`${r.method} ${r.url}`));
    for (const route of routes) {
      const path = route.url
        .replace(":id", "00000000-0000-4000-8000-000000000000")
        .replace(":userId", "00000000-0000-4000-8000-000000000000");
      const res = await anonymous.request(
        route.method as "GET",
        path,
        route.method === "GET" ? undefined : {},
      );
      expect(res.statusCode, `${route.method} ${route.url}`).toBe(401);
      expect(json(res).error).toBe("unauthenticated");
    }
  });

  it("a forged or expired session cookie is rejected", async () => {
    const res = await new Client(h).request("GET", "/v1/me", undefined, {
      cookie: "originos.session_token=forged.value",
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("sign-up, verification and sign-in", () => {
  it("cannot sign in before verifying the email, and short passwords are refused", async () => {
    const c = new Client(h);
    const email = uniqueEmail("unverified");
    expect(
      (await c.request("POST", "/api/auth/sign-up/email", { email, password: "short", name: "U" }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await c.request("POST", "/api/auth/sign-up/email", {
          email,
          password: "long enough password",
          name: "U",
        })
      ).statusCode,
    ).toBe(200);
    const signIn = await c.request("POST", "/api/auth/sign-in/email", {
      email,
      password: "long enough password",
    });
    expect(signIn.statusCode).toBe(403);
    expect((await c.request("GET", "/v1/me")).statusCode).toBe(401);
  });

  it("verifies, signs in, and reports the account", async () => {
    const email = uniqueEmail("verified");
    const c = await new Client(h).signUp(email);
    const me = json(await c.request("GET", "/v1/me"));
    expect(me).toMatchObject({
      user: { email, emailVerified: true, twoFactorEnabled: false },
      activeOrganizationId: null,
      memberships: [],
    });
  });

  it("auth endpoints refuse cross-site requests (CSRF)", async () => {
    // With a session cookie, Better Auth validates Origin against ORIGINOS_PUBLIC_URL.
    const c = await new Client(h).signUp(uniqueEmail("csrf-auth"));
    const signOut = await c.request(
      "POST",
      "/api/auth/sign-out",
      {},
      { origin: "https://evil.example" },
    );
    expect(signOut.statusCode).toBe(403);
    expect((await c.request("GET", "/v1/me")).statusCode).toBe(200);
    // Without cookies (login CSRF), it uses Fetch Metadata from the browser.
    const login = await new Client(h).request(
      "POST",
      "/api/auth/sign-in/email",
      { email: uniqueEmail("x"), password: "whatever whatever" },
      {
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document",
      },
    );
    expect(login.statusCode).toBe(403);
  });

  it("password reset email is sent and the link works", async () => {
    const email = uniqueEmail("reset");
    const c = await new Client(h).signUp(email);
    await c.request("POST", "/api/auth/request-password-reset", {
      email,
      redirectTo: `${ORIGIN}/reset-password`,
    });
    const link = await waitForMail(h.mailer, email, "Reset your OriginOS password");
    expect(link).toContain("/api/auth/reset-password/");
  });
});

describe("organizations and workspace switching", () => {
  it("a user creates organizations, lists them and switches between them", async () => {
    const alice = await new Client(h).signUp(uniqueEmail("alice"));
    const a1 = json(await alice.request("POST", "/v1/organizations", { name: "Alice Research" }));
    const a2 = json(await alice.request("POST", "/v1/organizations", { name: "Alice Studio" }));
    expect(a1).toMatchObject({ name: "Alice Research", role: "owner" });
    let me = json(await alice.request("GET", "/v1/me"));
    expect(me.activeOrganizationId).toBe(a2.organizationId);
    expect((me.memberships as unknown[]).length).toBe(2);
    expect(
      (
        await alice.request("PUT", "/v1/me/active-organization", {
          organizationId: a1.organizationId,
        })
      ).statusCode,
    ).toBe(200);
    me = json(await alice.request("GET", "/v1/me"));
    expect(me.activeOrganizationId).toBe(a1.organizationId);
    const org = json(await alice.request("GET", "/v1/organization"));
    expect(org).toMatchObject({ organization: { name: "Alice Research" }, myRole: "owner" });
  });

  it("a new session opens in the organization the person used most recently", async () => {
    const email = uniqueEmail("returning");
    const first = await new Client(h).signUp(email);
    const fresh = await new Client(h).request("POST", "/api/auth/sign-in/email", {
      email,
      password: "correct horse battery staple",
    });
    expect(fresh.statusCode).toBe(200);
    const o1 = json(await first.request("POST", "/v1/organizations", { name: "First Org" }));
    const o2 = json(await first.request("POST", "/v1/organizations", { name: "Second Org" }));
    await first.request("PUT", "/v1/me/active-organization", { organizationId: o1.organizationId });
    const later = new Client(h);
    const signIn = await later.request("POST", "/api/auth/sign-in/email", {
      email,
      password: "correct horse battery staple",
    });
    expect(signIn.statusCode).toBe(200);
    const me = json(await later.request("GET", "/v1/me"));
    expect(me.activeOrganizationId).toBe(o1.organizationId);
    expect(me.activeOrganizationId).not.toBe(o2.organizationId);
  });

  it("state-changing calls need the web origin and a JSON body", async () => {
    const c = await new Client(h).signUp(uniqueEmail("csrf"));
    const wrongOrigin = await c.request(
      "POST",
      "/v1/organizations",
      { name: "X Org" },
      { origin: "https://evil.example" },
    );
    expect(wrongOrigin.statusCode).toBe(403);
    expect(json(wrongOrigin).error).toBe("csrf_origin_mismatch");
    const form = await h.app.inject({
      method: "POST",
      url: "/v1/organizations",
      headers: {
        origin: ORIGIN,
        cookie: c.cookieHeader,
        "content-type": "application/x-www-form-urlencoded",
      },
      payload: "name=X+Org",
    });
    expect(form.statusCode).toBe(415);
  });
});

describe("cross-organization access is impossible", () => {
  it("another user cannot switch into, read, invite into or manage an organization they do not belong to", async () => {
    const alice = await new Client(h).signUp(uniqueEmail("alice"));
    const aliceOrg = json(
      await alice.request("POST", "/v1/organizations", { name: "Alice Private" }),
    );
    const invite = json(
      await alice.request("POST", "/v1/organization/invitations", {
        email: uniqueEmail("someone"),
        role: "member",
      }),
    );

    const mallory = await new Client(h).signUp(uniqueEmail("mallory"));
    // Switching in: same 404 as for a non-existent organization.
    const sw = await mallory.request("PUT", "/v1/me/active-organization", {
      organizationId: aliceOrg.organizationId,
    });
    expect(sw.statusCode).toBe(404);
    // Without an active organization, tenant routes refuse.
    expect((await mallory.request("GET", "/v1/organization")).statusCode).toBe(409);

    // Simulate a bug that writes Alice's org into Mallory's session: the guard re-checks membership.
    const malloryId = (json(await mallory.request("GET", "/v1/me")).user as { id: string }).id;
    await h.owner.db
      .update(schema.sessions)
      .set({ activeOrganizationId: aliceOrg.organizationId as string })
      .where(eq(schema.sessions.userId, malloryId));
    expect((await mallory.request("GET", "/v1/me")).body).toContain('"activeOrganizationId":null');
    for (const [method, path, body] of [
      ["GET", "/v1/organization", undefined],
      ["GET", "/v1/organization/invitations", undefined],
      ["GET", "/v1/organization/audit-events", undefined],
      ["POST", "/v1/organization/invitations", { email: uniqueEmail("x"), role: "admin" }],
      ["POST", `/v1/organization/invitations/${invite.id as string}/revoke`, {}],
      ["PATCH", "/v1/organization", { name: "pwned" }],
    ] as const) {
      const res = await mallory.request(method, path, body);
      expect(res.statusCode, `${method} ${path}`).toBe(409);
    }

    // Mallory's own organization cannot touch Alice's invitation either.
    await mallory.request("POST", "/v1/organizations", { name: "Mallory Org" });
    expect(
      (
        await mallory.request(
          "POST",
          `/v1/organization/invitations/${invite.id as string}/revoke`,
          {},
        )
      ).statusCode,
    ).toBe(404);
    const aliceSees = json(await alice.request("GET", "/v1/organization"));
    expect((aliceSees.organization as { name: string }).name).toBe("Alice Private");
    expect((aliceSees.members as unknown[]).length).toBe(1);
  });
});

describe("invitations", () => {
  async function setup() {
    const owner = await new Client(h).signUp(uniqueEmail("owner"));
    const org = json(await owner.request("POST", "/v1/organizations", { name: "Invite Co" }));
    return { owner, org };
  }

  it("the invited person accepts with the matching verified email and joins with the invited role", async () => {
    const { owner, org } = await setup();
    const carolEmail = uniqueEmail("carol");
    const created = await owner.request("POST", "/v1/organization/invitations", {
      email: carolEmail,
      role: "admin",
    });
    expect(created.statusCode).toBe(201);
    expect(created.body).not.toContain("token");
    const token = invitationToken(h.mailer, carolEmail);

    // Someone else holding the link cannot use it.
    const eve = await new Client(h).signUp(uniqueEmail("eve"));
    const eveLookup = json(await eve.request("POST", "/v1/invitations/lookup", { token }));
    expect(eveLookup).toMatchObject({
      organizationName: "Invite Co",
      status: "pending",
      emailMatches: false,
    });
    expect((await eve.request("POST", "/v1/invitations/accept", { token })).statusCode).toBe(403);

    const carol = await new Client(h).signUp(carolEmail);
    const accepted = await carol.request("POST", "/v1/invitations/accept", { token });
    expect(accepted.statusCode).toBe(200);
    expect(json(accepted)).toMatchObject({ organizationId: org.organizationId, role: "admin" });
    expect(json(await carol.request("GET", "/v1/me")).activeOrganizationId).toBe(
      org.organizationId,
    );
    // Single use.
    const again = await carol.request("POST", "/v1/invitations/accept", { token });
    expect(again.statusCode).toBe(409);
    expect(json(again).error).toBe("invitation_accepted");
    const list = json({
      body: (await owner.request("GET", "/v1/organization/invitations")).body,
    } as never) as unknown as Array<{ status: string }>;
    expect(list[0]?.status).toBe("accepted");
  });

  it("expired invitations cannot be accepted", async () => {
    const { owner } = await setup();
    const email = uniqueEmail("late");
    await owner.request("POST", "/v1/organization/invitations", { email, role: "member" });
    const token = invitationToken(h.mailer, email);
    await h.owner.db
      .update(schema.invitations)
      .set({ expiresAt: sql`now() - interval '1 minute'` })
      .where(eq(schema.invitations.email, email));
    const late = await new Client(h).signUp(email);
    expect(json(await late.request("POST", "/v1/invitations/lookup", { token })).status).toBe(
      "expired",
    );
    const res = await late.request("POST", "/v1/invitations/accept", { token });
    expect(res.statusCode).toBe(409);
    expect(json(res).error).toBe("invitation_expired");
    expect(json(await late.request("GET", "/v1/me")).memberships).toEqual([]);
  });

  it("revoked invitations cannot be accepted, and re-inviting supersedes the old link", async () => {
    const { owner } = await setup();
    const email = uniqueEmail("revoked");
    const first = json(
      await owner.request("POST", "/v1/organization/invitations", { email, role: "member" }),
    );
    const firstToken = invitationToken(h.mailer, email);
    expect(
      (await owner.request("POST", `/v1/organization/invitations/${first.id as string}/revoke`, {}))
        .statusCode,
    ).toBe(204);
    const person = await new Client(h).signUp(email);
    const res = await person.request("POST", "/v1/invitations/accept", { token: firstToken });
    expect(res.statusCode).toBe(409);
    expect(json(res).error).toBe("invitation_revoked");

    await owner.request("POST", "/v1/organization/invitations", { email, role: "member" });
    const secondToken = invitationToken(h.mailer, email);
    await owner.request("POST", "/v1/organization/invitations", { email, role: "member" });
    expect(
      json(await person.request("POST", "/v1/invitations/accept", { token: secondToken })).error,
    ).toBe("invitation_revoked");
    const thirdToken = invitationToken(h.mailer, email);
    expect(
      (await person.request("POST", "/v1/invitations/accept", { token: thirdToken })).statusCode,
    ).toBe(200);
  });

  it("an unknown token is not found", async () => {
    const c = await new Client(h).signUp(uniqueEmail("nobody"));
    expect(
      (await c.request("POST", "/v1/invitations/accept", { token: "x".repeat(43) })).statusCode,
    ).toBe(404);
  });
});

describe("roles, removal and owner transfer", () => {
  it("members cannot manage; the owner transfers ownership to a member and becomes admin", async () => {
    const owner = await new Client(h).signUp(uniqueEmail("own"));
    await owner.request("POST", "/v1/organizations", { name: "Transfer Co" });
    const memberEmail = uniqueEmail("mem");
    await owner.request("POST", "/v1/organization/invitations", {
      email: memberEmail,
      role: "member",
    });
    const member = await new Client(h).signUp(memberEmail);
    await member.request("POST", "/v1/invitations/accept", {
      token: invitationToken(h.mailer, memberEmail),
    });
    const memberId = (json(await member.request("GET", "/v1/me")).user as { id: string }).id;
    const ownerId = (json(await owner.request("GET", "/v1/me")).user as { id: string }).id;

    expect(
      (
        await member.request("POST", "/v1/organization/invitations", {
          email: uniqueEmail("x"),
          role: "member",
        })
      ).statusCode,
    ).toBe(403);
    expect((await member.request("GET", "/v1/organization/audit-events")).statusCode).toBe(403);
    expect((await member.request("DELETE", `/v1/organization/members/${ownerId}`)).statusCode).toBe(
      403,
    );
    expect(
      (await member.request("POST", "/v1/organization/transfer-ownership", { userId: memberId }))
        .statusCode,
    ).toBe(403);
    expect(json(await owner.request("DELETE", `/v1/organization/members/${ownerId}`)).error).toBe(
      "owner_cannot_leave",
    );

    expect(
      (await owner.request("POST", "/v1/organization/transfer-ownership", { userId: memberId }))
        .statusCode,
    ).toBe(204);
    const roster = json(await member.request("GET", "/v1/organization"));
    expect(roster.myRole).toBe("owner");
    const roles = Object.fromEntries(
      (roster.members as Array<{ userId: string; role: string }>).map((m) => [m.userId, m.role]),
    );
    expect(roles).toEqual({ [ownerId]: "admin", [memberId]: "owner" });

    // The new owner demotes the old one and then removes them; the audit log records it all.
    expect(
      (await member.request("PATCH", `/v1/organization/members/${ownerId}`, { role: "member" }))
        .statusCode,
    ).toBe(204);
    expect((await member.request("DELETE", `/v1/organization/members/${ownerId}`)).statusCode).toBe(
      204,
    );
    expect(json(await owner.request("GET", "/v1/me")).memberships).toEqual([]);
    const audit = JSON.parse(
      (await member.request("GET", "/v1/organization/audit-events")).body,
    ) as Array<{ action: string }>;
    expect(audit.map((a) => a.action)).toEqual([
      "member.removed",
      "member.role_changed",
      "ownership.transferred",
      "member.joined",
      "invitation.created",
      "organization.created",
    ]);
  });
});
