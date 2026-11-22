// Vocabulary of OriginOS authorization (ADR-024). Every module expresses its
// permission needs with these actor types, actions and resource types; new
// modules add resource types here rather than inventing their own checks.

export const ACTOR_TYPES = ["human", "service", "agent"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const ACTIONS = ["read", "write", "publish", "export", "admin"] as const;
export type Action = (typeof ACTIONS)[number];

export const ROLES = ["owner", "admin", "member"] as const;
export type Role = (typeof ROLES)[number];

/** Resource types that exist so far. Later phases append (work, source, connection, ...). */
export const RESOURCE_TYPES = [
  "organization",
  "members",
  "invitations",
  "audit_log",
  "grants",
  "agents",
  "consents",
  "files",
  "jobs",
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

/** A grant may name one resource type or every type ("*"). */
export type GrantResourceType = ResourceType | "*";

export interface Resource {
  readonly type: ResourceType;
  /** A specific resource; omitted for "any resource of this type in the organization". */
  readonly id?: string;
  /** The person who owns this specific resource, when ownership confers rights (agents). */
  readonly ownerId?: string;
}

export type GrantEffect = "allow" | "deny";

/** A resource-scoped grant or explicit deny, already filtered to one subject and organization. */
export interface Grant {
  readonly id: string;
  readonly effect: GrantEffect;
  readonly resourceType: GrantResourceType;
  /** null = every resource of that type. */
  readonly resourceId: string | null;
  readonly actions: readonly Action[];
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
}

export interface HumanActor {
  readonly type: "human";
  readonly id: string;
  /** Role in the organization, or null if not a member. */
  readonly role: Role | null;
  readonly grants: readonly Grant[];
}

export interface ServiceActor {
  readonly type: "service";
  readonly id: string;
  readonly grants: readonly Grant[];
}

export interface AgentActor {
  readonly type: "agent";
  readonly id: string;
  readonly active: boolean;
  readonly grants: readonly Grant[];
  /** The person accountable for the agent. An agent can never do more than they can. */
  readonly owner: HumanActor;
}

export type Actor = HumanActor | ServiceActor | AgentActor;

export type DecisionReason =
  | "role"
  | "grant"
  | "resource_owner"
  | "agent_default"
  | "not_member"
  | "explicit_deny"
  | "no_permission"
  | "agent_inactive"
  | "agent_admin_forbidden"
  | "agent_owner_lacks_permission";

export interface Decision {
  readonly allowed: boolean;
  readonly reason: DecisionReason;
  /** The grant that decided the outcome, when one did. */
  readonly grantId?: string;
}
