import {
  ACTIONS,
  RESOURCE_TYPES,
  type Action,
  type Actor,
  type AgentActor,
  type Decision,
  type Grant,
  type HumanActor,
  type Resource,
  type ResourceType,
  type Role,
} from "./model.js";

/**
 * What each role may do on every resource of its organization. Deny by
 * default: anything not listed is refused. Ownership transfer and other
 * organization-level "admin" actions belong to the owner alone.
 */
const ROLE_PERMISSIONS: Record<Role, Readonly<Partial<Record<ResourceType, readonly Action[]>>>> = {
  owner: Object.fromEntries(RESOURCE_TYPES.map((t) => [t, ACTIONS])),
  admin: {
    organization: ["read", "write", "publish", "export"],
    members: ["read", "write", "export", "admin"],
    invitations: ["read", "write", "admin"],
    audit_log: ["read", "export"],
    grants: ["read", "write", "admin"],
    agents: ["read", "write", "admin"],
    consents: ["read", "write"],
  },
  member: {
    organization: ["read"],
    members: ["read"],
    agents: ["read"],
    consents: ["read"],
  },
};

/** Resource types on which the owner of a specific resource may read and change it. */
const OWNER_MANAGED: ReadonlySet<ResourceType> = new Set(["agents"]);
const OWNER_ACTIONS: ReadonlySet<Action> = new Set(["read", "write"]);

/**
 * What a new agent may do before anyone grants it more: read the organization
 * it belongs to. Always also capped by its owner's permissions.
 */
const AGENT_DEFAULT: Readonly<Partial<Record<ResourceType, readonly Action[]>>> = {
  organization: ["read"],
};

export function rolePermits(role: Role, action: Action, type: ResourceType): boolean {
  return ROLE_PERMISSIONS[role][type]?.includes(action) ?? false;
}

function grantIsLive(grant: Grant, now: Date): boolean {
  return grant.revokedAt === null && (grant.expiresAt === null || grant.expiresAt > now);
}

function grantMatches(grant: Grant, action: Action, resource: Resource, now: Date): boolean {
  if (!grantIsLive(grant, now) || !grant.actions.includes(action)) return false;
  if (grant.resourceType !== "*" && grant.resourceType !== resource.type) return false;
  // A grant for one resource never covers "all resources of the type".
  return grant.resourceId === null || grant.resourceId === resource.id;
}

function matching(grants: readonly Grant[], action: Action, resource: Resource, now: Date) {
  const hits = grants.filter((g) => grantMatches(g, action, resource, now));
  return {
    deny: hits.find((g) => g.effect === "deny"),
    allow: hits.find((g) => g.effect === "allow"),
  };
}

function evaluateHuman(actor: HumanActor, action: Action, resource: Resource, now: Date): Decision {
  const { deny, allow } = matching(actor.grants, action, resource, now);
  if (deny) return { allowed: false, reason: "explicit_deny", grantId: deny.id };
  if (actor.role === null) return { allowed: false, reason: "not_member" };
  if (rolePermits(actor.role, action, resource.type)) return { allowed: true, reason: "role" };
  if (allow) return { allowed: true, reason: "grant", grantId: allow.id };
  if (
    resource.ownerId === actor.id &&
    OWNER_MANAGED.has(resource.type) &&
    OWNER_ACTIONS.has(action)
  ) {
    return { allowed: true, reason: "resource_owner" };
  }
  return { allowed: false, reason: "no_permission" };
}

function evaluateAgent(actor: AgentActor, action: Action, resource: Resource, now: Date): Decision {
  if (!actor.active) return { allowed: false, reason: "agent_inactive" };
  // Administration (roles, grants, ownership) always needs a person.
  if (action === "admin") return { allowed: false, reason: "agent_admin_forbidden" };
  const { deny, allow } = matching(actor.grants, action, resource, now);
  if (deny) return { allowed: false, reason: "explicit_deny", grantId: deny.id };
  const own: Decision | null = allow
    ? { allowed: true, reason: "grant", grantId: allow.id }
    : AGENT_DEFAULT[resource.type]?.includes(action)
      ? { allowed: true, reason: "agent_default" }
      : null;
  if (!own) return { allowed: false, reason: "no_permission" };
  // Intersection with the owner: an agent's permissions are always a subset of its owner's.
  const owner = evaluateHuman(actor.owner, action, resource, now);
  if (!owner.allowed) return { allowed: false, reason: "agent_owner_lacks_permission" };
  return own;
}

/**
 * The one permission check. Pure and deterministic: callers load the actor's
 * role and grants (scoped to one organization) and pass them in.
 * Order: explicit deny → membership → role → grant → resource ownership; deny by default.
 */
export function evaluate(
  actor: Actor,
  action: Action,
  resource: Resource,
  now: Date = new Date(),
): Decision {
  switch (actor.type) {
    case "human":
      return evaluateHuman(actor, action, resource, now);
    case "agent":
      return evaluateAgent(actor, action, resource, now);
    case "service": {
      // Services have no role: only explicit grants, and deny still wins.
      const { deny, allow } = matching(actor.grants, action, resource, now);
      if (deny) return { allowed: false, reason: "explicit_deny", grantId: deny.id };
      if (allow) return { allowed: true, reason: "grant", grantId: allow.id };
      return { allowed: false, reason: "no_permission" };
    }
  }
}

export type PermissionMatrix = Record<ResourceType, Action[]>;

/** Every action the actor may take on each resource type (organization-wide), for display only. */
export function effectivePermissions(actor: Actor, now: Date = new Date()): PermissionMatrix {
  return Object.fromEntries(
    RESOURCE_TYPES.map((type) => [
      type,
      ACTIONS.filter((action) => evaluate(actor, action, { type }, now).allowed),
    ]),
  ) as PermissionMatrix;
}
