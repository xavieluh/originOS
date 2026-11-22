// Phase 05 acceptance checks through the real HTTP stack against PostgreSQL with
// row-level security: permission checks, explicit deny, privilege escalation,
// agent permissions and consent.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type Harness, invitationToken, startHarness, uniqueEmail } from "./helpers.js";

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

type Json = Record<string, unknown>;
const json = (r: { body: string }) => JSON.parse(r.body) as Json;
const list = (r: { body: string }) => JSON.parse(r.body) as Json[];

interface Team {
  owner: Client;
  admin: Client;
  member: Client;
  ids: { org: string; owner: string; admin: string; member: string };
}

async function userId(c: Client): Promise<string> {
  return (json(await c.request("GET", "/v1/me")).user as Json).id as string;
}

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

async function team(): Promise<Team> {
  const owner = await new Client(h).signUp(uniqueEmail("owner"));
  const org = json(await owner.request("POST", "/v1/organizations", { name: "Policy Lab" }));
  const admin = await join(owner, "admin");
  const member = await join(owner, "member");
  return {
    owner,
    admin,
    member,
    ids: {
      org: org.organizationId as string,
      owner: await userId(owner),
      admin: await userId(admin),
      member: await userId(member),
    },
  };
}

async function auditActions(c: Client): Promise<string[]> {
  return list(await c.request("GET", "/v1/organization/audit-events")).map(
    (e) => e.action as string,
  );
}

describe("roles and audit", () => {
  it("a role change is recorded in the audit log with the new role", async () => {
    const t = await team();
    const res = await t.owner.request("PATCH", `/v1/organization/members/${t.ids.member}`, {
      role: "admin",
    });
    expect(res.statusCode).toBe(204);
    const events = list(await t.owner.request("GET", "/v1/organization/audit-events"));
    const change = events.find((e) => e.action === "member.role_changed");
    expect(change).toMatchObject({
      targetId: t.ids.member,
      actorUserId: t.ids.owner,
      metadata: { role: "admin" },
    });
  });

  it("each person can read their own effective permissions", async () => {
    const t = await team();
    const mine = json(await t.member.request("GET", "/v1/me/permissions"));
    expect(mine.role).toBe("member");
    expect(mine.permissions).toMatchObject({ organization: ["read"], audit_log: [], grants: [] });
    const owner = json(await t.owner.request("GET", "/v1/me/permissions"));
    expect((owner.permissions as Json).organization).toContain("admin");
  });
});

describe("the backend refuses forbidden reads and writes, whatever the UI shows", () => {
  it("a member calling management endpoints directly gets 403 with a reason", async () => {
    const t = await team();
    const calls: Array<[method: "GET" | "POST" | "PATCH", path: string, body?: unknown]> = [
      ["GET", "/v1/organization/audit-events"],
      ["GET", "/v1/organization/invitations"],
      ["GET", "/v1/organization/grants"],
      ["PATCH", "/v1/organization", { name: "Hijacked" }],
      ["POST", "/v1/organization/invitations", { email: uniqueEmail("x"), role: "member" }],
      ["PATCH", `/v1/organization/members/${t.ids.admin}`, { role: "member" }],
      ["POST", "/v1/organization/transfer-ownership", { userId: t.ids.member }],
      [
        "POST",
        "/v1/organization/grants",
        {
          subjectType: "user",
          subjectId: t.ids.member,
          effect: "allow",
          resourceType: "audit_log",
          actions: ["read"],
        },
      ],
      ["POST", "/v1/organization/consents", { purpose: "data_sharing" }],
    ];
    for (const [method, path, body] of calls) {
      const res = await t.member.request(method, path, body);
      expect(res.statusCode, `${method} ${path}`).toBe(403);
      expect(json(res), `${method} ${path}`).toMatchObject({
        error: "forbidden",
        reason: "no_permission",
      });
    }
    const org = json(await t.owner.request("GET", "/v1/organization")).organization as Json;
    expect(org.name).toBe("Policy Lab");
  });

  it("an admin cannot transfer ownership (organization admin is the owner's alone)", async () => {
    const t = await team();
    const res = await t.admin.request("POST", "/v1/organization/transfer-ownership", {
      userId: t.ids.admin,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("explicit deny", () => {
  it("a deny on an admin beats their role, cannot be lifted by them, and ends when revoked", async () => {
    const t = await team();
    const deny = await t.owner.request("POST", "/v1/organization/grants", {
      subjectType: "user",
      subjectId: t.ids.admin,
      effect: "deny",
      resourceType: "invitations",
      actions: ["write"],
      reason: "Invitations paused during audit",
    });
    expect(deny.statusCode).toBe(201);
    const grantId = json(deny).id as string;

    const invite = await t.admin.request("POST", "/v1/organization/invitations", {
      email: uniqueEmail("blocked"),
      role: "member",
    });
    expect(invite.statusCode).toBe(403);
    expect(json(invite).reason).toBe("explicit_deny");
    // Reading invitations is a different action and still works.
    expect((await t.admin.request("GET", "/v1/organization/invitations")).statusCode).toBe(200);

    const selfLift = await t.admin.request("POST", `/v1/organization/grants/${grantId}/revoke`);
    expect(selfLift.statusCode).toBe(404);

    expect(
      (await t.owner.request("POST", `/v1/organization/grants/${grantId}/revoke`)).statusCode,
    ).toBe(204);
    const after = await t.admin.request("POST", "/v1/organization/invitations", {
      email: uniqueEmail("unblocked"),
      role: "member",
    });
    expect(after.statusCode).toBe(201);
    const actions = await auditActions(t.owner);
    expect(actions).toEqual(expect.arrayContaining(["grant.created", "grant.revoked"]));
  });

  it("nobody can deny the owner", async () => {
    const t = await team();
    const res = await t.admin.request("POST", "/v1/organization/grants", {
      subjectType: "user",
      subjectId: t.ids.owner,
      effect: "deny",
      resourceType: "*",
      actions: ["read"],
    });
    expect(res.statusCode).toBe(400);
    expect(json(res).error).toBe("cannot_deny_owner");
  });
});

describe("privilege escalation is refused", () => {
  it("admins cannot hand out ownership, actions they lack, or permissions to themselves", async () => {
    const t = await team();
    const attempt = (body: Json) =>
      t.admin.request("POST", "/v1/organization/grants", {
        subjectType: "user",
        subjectId: t.ids.member,
        effect: "allow",
        resourceType: "audit_log",
        actions: ["read"],
        ...body,
      });
    const cases: Array<[Json, string]> = [
      [{ resourceType: "organization", actions: ["admin"] }, "ownership_is_role_only"],
      [{ resourceType: "*", actions: ["admin"] }, "ownership_is_role_only"],
      [{ resourceType: "consents", actions: ["admin"] }, "grant_exceeds_grantor"],
      [{ subjectId: t.ids.admin }, "cannot_grant_self"],
      [{ resourceType: "members", actions: ["write"] }, "grant_not_enforceable"],
    ];
    for (const [body, code] of cases) {
      const res = await attempt(body);
      expect(res.statusCode, code).toBe(400);
      expect(json(res).error, JSON.stringify(body)).toBe(code);
    }
    const perms = json(await t.member.request("GET", "/v1/me/permissions")).permissions as Json;
    expect(perms.members).toEqual(["read"]);
  });

  it("an allow grant gives a member audit-log access until it is revoked", async () => {
    const t = await team();
    const created = await t.admin.request("POST", "/v1/organization/grants", {
      subjectType: "user",
      subjectId: t.ids.member,
      effect: "allow",
      resourceType: "audit_log",
      actions: ["read"],
    });
    expect(created.statusCode).toBe(201);
    expect((await t.member.request("GET", "/v1/organization/audit-events")).statusCode).toBe(200);
    await t.owner.request("POST", `/v1/organization/grants/${json(created).id as string}/revoke`);
    expect((await t.member.request("GET", "/v1/organization/audit-events")).statusCode).toBe(403);
  });

  it("grants for people in other organizations are refused", async () => {
    const t = await team();
    const outsider = await new Client(h).signUp(uniqueEmail("outsider"));
    await outsider.request("POST", "/v1/organizations", { name: "Elsewhere" });
    const res = await t.owner.request("POST", "/v1/organization/grants", {
      subjectType: "user",
      subjectId: await userId(outsider),
      effect: "allow",
      resourceType: "audit_log",
      actions: ["read"],
    });
    expect(res.statusCode).toBe(404);
    const theirs = list(await outsider.request("GET", "/v1/organization/grants"));
    expect(theirs).toEqual([]);
  });
});

describe("agents", () => {
  it("an agent starts narrower than its owner and can never exceed them", async () => {
    const t = await team();
    const created = await t.member.request("POST", "/v1/organization/agents", {
      name: "Citation checker",
      description: "Checks references in drafts",
    });
    expect(created.statusCode).toBe(201);
    const agentId = json(created).id as string;

    const view = json(
      await t.member.request("GET", `/v1/organization/agents/${agentId}/permissions`),
    );
    const its = view.permissions as Record<string, string[]>;
    const owners = view.ownerPermissions as Record<string, string[]>;
    expect(its.organization).toEqual(["read"]);
    let agentTotal = 0;
    let ownerTotal = 0;
    for (const [type, actions] of Object.entries(its)) {
      for (const a of actions) expect(owners[type]).toContain(a);
      agentTotal += actions.length;
      ownerTotal += owners[type]?.length ?? 0;
    }
    expect(agentTotal).toBeLessThan(ownerTotal);

    // The owner of the organization grants the agent audit-log access its owner lacks: no effect.
    const grant = await t.owner.request("POST", "/v1/organization/grants", {
      subjectType: "agent",
      subjectId: agentId,
      effect: "allow",
      resourceType: "audit_log",
      actions: ["read"],
    });
    expect(grant.statusCode).toBe(201);
    const capped = json(
      await t.member.request("GET", `/v1/organization/agents/${agentId}/permissions`),
    );
    expect((capped.permissions as Json).audit_log).toEqual([]);
    expect((capped.grants as Json[]).length).toBe(1);
  });

  it("only the agent's owner (or an admin) manages it, and disabling is audited", async () => {
    const t = await team();
    const adminAgent = json(
      await t.admin.request("POST", "/v1/organization/agents", { name: "Admin bot" }),
    );
    const memberAgent = json(
      await t.member.request("POST", "/v1/organization/agents", { name: "Member bot" }),
    );

    const listed = list(await t.member.request("GET", "/v1/organization/agents"));
    expect(listed.map((a) => [a.name, a.canManage])).toEqual([
      ["Admin bot", false],
      ["Member bot", true],
    ]);
    const steal = await t.member.request(
      "POST",
      `/v1/organization/agents/${adminAgent.id as string}/disable`,
    );
    expect(steal.statusCode).toBe(403);
    const peek = await t.member.request(
      "GET",
      `/v1/organization/agents/${adminAgent.id as string}/permissions`,
    );
    expect(peek.statusCode).toBe(403);

    expect(
      (
        await t.member.request(
          "POST",
          `/v1/organization/agents/${memberAgent.id as string}/disable`,
        )
      ).statusCode,
    ).toBe(204);
    const disabled = json(
      await t.member.request(
        "GET",
        `/v1/organization/agents/${memberAgent.id as string}/permissions`,
      ),
    );
    expect((disabled.permissions as Json).organization).toEqual([]);
    expect(await auditActions(t.owner)).toEqual(
      expect.arrayContaining(["agent.created", "agent.disabled"]),
    );
  });
});

describe("consent", () => {
  it("a person gives, inspects and revokes their own consent, and the history is kept", async () => {
    const t = await team();
    const given = await t.member.request("POST", "/v1/me/consents", {
      purpose: "telemetry_collection",
    });
    expect(given.statusCode).toBe(201);
    expect(json(given)).toMatchObject({ purpose: "telemetry_collection", status: "active" });
    const dup = await t.member.request("POST", "/v1/me/consents", {
      purpose: "telemetry_collection",
    });
    expect(dup.statusCode).toBe(409);

    const listed = json(await t.member.request("GET", "/v1/me/consents"));
    expect(listed.policyVersion).toBeTruthy();
    expect((listed.purposes as Json[]).map((p) => p.purpose)).not.toContain("cross_org_policy");
    expect(listed.records as Json[]).toHaveLength(1);
    // Other people never see someone's personal consents.
    expect(json(await t.owner.request("GET", "/v1/me/consents")).records).toEqual([]);

    const id = json(given).id as string;
    expect((await t.owner.request("POST", `/v1/me/consents/${id}/revoke`)).statusCode).toBe(404);
    expect((await t.member.request("POST", `/v1/me/consents/${id}/revoke`)).statusCode).toBe(204);
    expect((await t.member.request("POST", `/v1/me/consents/${id}/revoke`)).statusCode).toBe(404);
    const again = await t.member.request("POST", "/v1/me/consents", {
      purpose: "telemetry_collection",
    });
    expect(again.statusCode).toBe(201);
    const history = json(await t.member.request("GET", "/v1/me/consents")).records as Json[];
    expect(history.map((r) => r.status)).toEqual(["active", "revoked"]);
    expect(await auditActions(t.owner)).toEqual(
      expect.arrayContaining(["consent.granted", "consent.revoked"]),
    );
  });

  it("organization policies are set by owners and admins, with a scope where one is needed", async () => {
    const t = await team();
    expect(
      (await t.owner.request("POST", "/v1/organization/consents", { purpose: "cross_org_policy" }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await t.owner.request("POST", "/v1/organization/consents", {
          purpose: "identity_directory",
        })
      ).statusCode,
    ).toBe(400);
    const partner = "7b0c6d1e-1111-4222-8333-444455556666";
    const set = await t.admin.request("POST", "/v1/organization/consents", {
      purpose: "cross_org_policy",
      scopeKey: partner,
    });
    expect(set.statusCode).toBe(201);
    const seen = json(await t.member.request("GET", "/v1/organization/consents"));
    expect((seen.records as Json[]).map((r) => r.scopeKey)).toEqual([partner]);
    const revoke = await t.member.request(
      "POST",
      `/v1/organization/consents/${json(set).id as string}/revoke`,
    );
    expect(revoke.statusCode).toBe(403);
  });
});
