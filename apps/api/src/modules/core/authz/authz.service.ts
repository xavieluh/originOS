import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  type Action,
  type AgentActor,
  type Decision,
  type Grant,
  type HumanActor,
  type Resource,
  evaluate,
} from "@originos/authz";
import { type Db, type Tx, schema, withScope } from "@originos/db";
import { and, eq } from "drizzle-orm";
import { ApiError } from "../auth/errors.js";
import type { Principal, TenantContext } from "../auth/principal.js";
import { APP_DB } from "../auth/tokens.js";

const { permissionGrants, memberships } = schema;

type GrantRow = typeof permissionGrants.$inferSelect;
type AgentRow = typeof schema.agents.$inferSelect;

/** Shape a stored grant for the evaluator. Unknown actions or resource types never match anything. */
export function toGrant(row: GrantRow): Grant {
  return {
    id: row.id,
    effect: row.effect,
    resourceType: row.resourceType as Grant["resourceType"],
    resourceId: row.resourceId,
    actions: row.actions as Action[],
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

const REASON_MESSAGES: Partial<Record<Decision["reason"], string>> = {
  explicit_deny: "An explicit deny in this organization blocks that action for you.",
  not_member: "You are not a member of this organization.",
  agent_inactive: "This agent is disabled.",
  agent_admin_forbidden: "Agents can never perform administrative actions.",
  agent_owner_lacks_permission: "An agent can never do more than the person who owns it.",
};

/** 403 that says why, so people (and agent owners) can tell a deny from a missing role. */
export function permissionDenied(decision: Decision): ApiError {
  const error = new ApiError(
    HttpStatus.FORBIDDEN,
    "forbidden",
    REASON_MESSAGES[decision.reason] ?? "You do not have permission to do that.",
  );
  (error.getResponse() as Record<string, unknown>).reason = decision.reason;
  return error;
}

/**
 * Loads actors (role + live grants) from the database and asks @originos/authz.
 * The evaluator is the only place permission rules live; row-level security
 * remains the floor underneath (ADR-023, ADR-024).
 */
@Injectable()
export class AuthzService {
  constructor(@Inject(APP_DB) private readonly db: Db | null) {}

  private get database(): Db {
    if (!this.db) throw new Error("AuthzService used without a database");
    return this.db;
  }

  async grantsFor(tx: Tx, tenantId: string, subjectType: "user" | "agent", subjectId: string) {
    const rows = await tx
      .select()
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.tenantId, tenantId),
          eq(permissionGrants.subjectType, subjectType),
          eq(permissionGrants.subjectId, subjectId),
        ),
      );
    return rows.map(toGrant);
  }

  /** The signed-in person as an actor in their active organization. */
  async humanActor(principal: Principal, tenant: TenantContext): Promise<HumanActor> {
    return withScope(
      this.database,
      { userId: principal.userId, tenantId: tenant.tenantId },
      async (tx) => ({
        type: "human",
        id: principal.userId,
        role: tenant.role,
        grants: await this.grantsFor(tx, tenant.tenantId, "user", principal.userId),
      }),
    );
  }

  /**
   * An agent as an actor, with its owner's current role and grants (the cap).
   * Runs inside the caller's scoped transaction; the caller must be able to
   * see the agent's grants (its owner, or an owner/admin).
   */
  async agentActor(tx: Tx, agent: AgentRow): Promise<AgentActor> {
    const [ownerMembership] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(eq(memberships.tenantId, agent.tenantId), eq(memberships.userId, agent.ownerUserId)),
      );
    return {
      type: "agent",
      id: agent.id,
      active: agent.status === "active",
      grants: await this.grantsFor(tx, agent.tenantId, "agent", agent.id),
      owner: {
        type: "human",
        id: agent.ownerUserId,
        role: ownerMembership?.role ?? null,
        grants: await this.grantsFor(tx, agent.tenantId, "user", agent.ownerUserId),
      },
    };
  }

  /** Throw 403 unless `actor` may take `action` on `resource`. */
  require(actor: HumanActor | AgentActor, action: Action, resource: Resource): void {
    const decision = evaluate(actor, action, resource);
    if (!decision.allowed) throw permissionDenied(decision);
  }
}
