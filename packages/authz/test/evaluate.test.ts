import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  RESOURCE_TYPES,
  checkGrant,
  effectivePermissions,
  evaluate,
  type AgentActor,
  type Grant,
  type HumanActor,
  type ProposedGrant,
  type Role,
} from "../src/index.js";

const now = new Date("2026-11-22T12:00:00Z");
let n = 0;
const grant = (g: Partial<Grant> & Pick<Grant, "actions">): Grant => ({
  id: `g${++n}`,
  effect: "allow",
  resourceType: "audit_log",
  resourceId: null,
  expiresAt: null,
  revokedAt: null,
  ...g,
});
const human = (role: Role | null, grants: Grant[] = [], id = "u1"): HumanActor => ({
  type: "human",
  id,
  role,
  grants,
});
const agent = (owner: HumanActor, grants: Grant[] = [], active = true): AgentActor => ({
  type: "agent",
  id: "a1",
  active,
  grants,
  owner,
});

describe("roles", () => {
  it("deny by default: a non-member can do nothing, whatever grants still exist", () => {
    const outsider = human(null, [grant({ actions: ["read"] })]);
    for (const type of RESOURCE_TYPES)
      for (const action of ACTIONS)
        expect(evaluate(outsider, action, { type }, now).allowed, `${action} ${type}`).toBe(false);
  });

  it("owner can do everything; ownership admin is the owner's alone", () => {
    expect(evaluate(human("owner"), "admin", { type: "organization" }, now)).toEqual({
      allowed: true,
      reason: "role",
    });
    expect(evaluate(human("admin"), "admin", { type: "organization" }, now).allowed).toBe(false);
  });

  it("members read the organization and roster but cannot manage", () => {
    const member = human("member");
    expect(evaluate(member, "read", { type: "members" }, now).allowed).toBe(true);
    for (const [action, type] of [
      ["write", "members"],
      ["admin", "invitations"],
      ["read", "audit_log"],
      ["admin", "grants"],
      ["write", "consents"],
    ] as const)
      expect(evaluate(member, action, { type }, now).allowed, `${action} ${type}`).toBe(false);
  });

  it("members manage agents they own, not other people's", () => {
    const member = human("member");
    expect(evaluate(member, "write", { type: "agents", id: "a1", ownerId: "u1" }, now).reason).toBe(
      "resource_owner",
    );
    expect(
      evaluate(member, "write", { type: "agents", id: "a2", ownerId: "u2" }, now).allowed,
    ).toBe(false);
    expect(
      evaluate(member, "admin", { type: "agents", id: "a1", ownerId: "u1" }, now).allowed,
    ).toBe(false);
  });
});

describe("grants and explicit deny", () => {
  it("an allow grant extends a member; expired and revoked grants do nothing", () => {
    const g = grant({ actions: ["read"] });
    expect(evaluate(human("member", [g]), "read", { type: "audit_log" }, now)).toEqual({
      allowed: true,
      reason: "grant",
      grantId: g.id,
    });
    const expired = grant({ actions: ["read"], expiresAt: new Date("2026-11-22T11:59:59Z") });
    const revoked = grant({ actions: ["read"], revokedAt: new Date("2026-11-01") });
    expect(
      evaluate(human("member", [expired, revoked]), "read", { type: "audit_log" }, now).allowed,
    ).toBe(false);
  });

  it("explicit deny beats role and allow grants, including wildcard denies", () => {
    const deny = grant({ effect: "deny", resourceType: "invitations", actions: ["admin"] });
    expect(evaluate(human("admin", [deny]), "admin", { type: "invitations" }, now)).toEqual({
      allowed: false,
      reason: "explicit_deny",
      grantId: deny.id,
    });
    const all = grant({ effect: "deny", resourceType: "*", actions: ["export"] });
    const allow = grant({ resourceType: "audit_log", actions: ["export"] });
    expect(
      evaluate(human("admin", [allow, all]), "export", { type: "audit_log" }, now).reason,
    ).toBe("explicit_deny");
  });

  it("a grant on one resource does not cover the whole type", () => {
    const one = grant({ resourceType: "agents", resourceId: "a9", actions: ["write"] });
    const member = human("member", [one]);
    expect(evaluate(member, "write", { type: "agents", id: "a9" }, now).allowed).toBe(true);
    expect(evaluate(member, "write", { type: "agents", id: "a8" }, now).allowed).toBe(false);
    expect(evaluate(member, "write", { type: "agents" }, now).allowed).toBe(false);
  });

  it("services have only what they are granted", () => {
    const svc = { type: "service" as const, id: "s1", grants: [grant({ actions: ["export"] })] };
    expect(evaluate(svc, "export", { type: "audit_log" }, now).allowed).toBe(true);
    expect(evaluate(svc, "read", { type: "organization" }, now).allowed).toBe(false);
  });
});

describe("agents", () => {
  it("by default an agent can only read the organization, a strict subset of its owner", () => {
    for (const role of ["owner", "admin", "member"] as const) {
      const owner = human(role);
      const bot = agent(owner);
      const mine = effectivePermissions(owner, now);
      const its = effectivePermissions(bot, now);
      expect(its.organization).toEqual(["read"]);
      let ownerTotal = 0;
      let agentTotal = 0;
      for (const type of RESOURCE_TYPES) {
        for (const action of its[type])
          expect(mine[type], `${role}: ${action} ${type}`).toContain(action);
        ownerTotal += mine[type].length;
        agentTotal += its[type].length;
      }
      expect(agentTotal, role).toBeLessThan(ownerTotal);
    }
  });

  it("grants beyond the owner's permissions have no effect", () => {
    const bot = agent(human("member"), [
      grant({ resourceType: "audit_log", actions: ["read", "export"] }),
    ]);
    expect(evaluate(bot, "read", { type: "audit_log" }, now)).toEqual({
      allowed: false,
      reason: "agent_owner_lacks_permission",
    });
  });

  it("never administers, even with an admin grant from an owner", () => {
    const bot = agent(human("owner"), [grant({ resourceType: "*", actions: [...ACTIONS] })]);
    expect(evaluate(bot, "admin", { type: "grants" }, now).reason).toBe("agent_admin_forbidden");
    expect(evaluate(bot, "write", { type: "members" }, now).allowed).toBe(true);
  });

  it("stops when disabled, when its owner leaves, or when its owner is denied", () => {
    expect(
      evaluate(agent(human("owner"), [], false), "read", { type: "organization" }, now).reason,
    ).toBe("agent_inactive");
    expect(evaluate(agent(human(null)), "read", { type: "organization" }, now).allowed).toBe(false);
    const denied = human("admin", [
      grant({ effect: "deny", resourceType: "organization", actions: ["read"] }),
    ]);
    expect(evaluate(agent(denied), "read", { type: "organization" }, now).allowed).toBe(false);
  });
});

describe("checkGrant (privilege escalation)", () => {
  const target = { type: "human" as const, id: "u2", isOrganizationOwner: false };
  const proposal = (p: Partial<ProposedGrant>): ProposedGrant => ({
    effect: "allow",
    resourceType: "audit_log",
    resourceId: null,
    actions: ["read"],
    subject: target,
    ...p,
  });

  it("members cannot grant anything", () => {
    expect(checkGrant(human("member"), proposal({}), now)).toBe("grantor_cannot_manage_grants");
  });

  it("admins cannot hand out ownership, actions they lack, or grants to themselves", () => {
    const admin = human("admin");
    expect(checkGrant(admin, proposal({}), now)).toBeNull();
    expect(
      checkGrant(admin, proposal({ resourceType: "organization", actions: ["admin"] }), now),
    ).toBe("ownership_is_role_only");
    expect(checkGrant(admin, proposal({ resourceType: "*", actions: ["admin"] }), now)).toBe(
      "ownership_is_role_only",
    );
    expect(checkGrant(admin, proposal({ resourceType: "consents", actions: ["admin"] }), now)).toBe(
      "grant_exceeds_grantor",
    );
    expect(checkGrant(admin, proposal({ subject: { ...target, id: "u1" } }), now)).toBe(
      "cannot_grant_self",
    );
  });

  it("an admin denied an action cannot grant it on", () => {
    const admin = human("admin", [
      grant({ effect: "deny", resourceType: "audit_log", actions: ["export"] }),
    ]);
    expect(checkGrant(admin, proposal({ actions: ["export"] }), now)).toBe("grant_exceeds_grantor");
  });

  it("nobody can deny the owner; empty grants are refused", () => {
    expect(
      checkGrant(
        human("admin"),
        proposal({ effect: "deny", subject: { ...target, isOrganizationOwner: true } }),
        now,
      ),
    ).toBe("cannot_deny_owner");
    expect(checkGrant(human("owner"), proposal({ actions: [] }), now)).toBe("empty_grant");
  });
});
