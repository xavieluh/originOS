import { Inject, Injectable } from "@nestjs/common";
import {
  type Action,
  type GrantResourceType,
  type HumanActor,
  type ResourceType,
  checkGrant,
  effectivePermissions,
  evaluate,
} from "@originos/authz";
import { type Db, type Tx, schema, withScope } from "@originos/db";
import { and, desc, eq, isNull, ne, or } from "drizzle-orm";
import { badRequest, conflict, notFound } from "../auth/errors.js";
import type { Principal, TenantContext } from "../auth/principal.js";
import { APP_DB } from "../auth/tokens.js";
import { recordAudit } from "../audit/audit.js";
import { AuthzService, permissionDenied } from "./authz.service.js";

const { agents, permissionGrants, memberships, users } = schema;

type AgentRow = typeof agents.$inferSelect;
type GrantRow = typeof permissionGrants.$inferSelect;

/**
 * Allow grants to people may only add access that the database layer also
 * honors. Row-level security keeps most management (members, invitations,
 * grants, organization settings) to owners and admins, so an allow grant for
 * those would pass the API and then silently fail in Postgres. Until those
 * policies consult grants, people can be granted extra access to the audit
 * log only. Deny grants (narrowing) and grants to agents (always capped by the
 * owner) have no such limit. ADR-024.
 */
export const HUMAN_ALLOW_GRANTABLE: Readonly<Partial<Record<ResourceType, readonly Action[]>>> = {
  audit_log: ["read", "export"],
};

export interface CreateGrantInput {
  readonly subjectType: "user" | "agent";
  readonly subjectId: string;
  readonly effect: "allow" | "deny";
  readonly resourceType: GrantResourceType;
  readonly resourceId: string | null;
  readonly actions: readonly Action[];
  readonly reason: string | null;
  readonly expiresAt: Date | null;
}

const GRANT_REFUSAL_MESSAGES = {
  grantor_cannot_manage_grants: "Only owners and admins can manage permissions.",
  grant_exceeds_grantor: "You cannot grant an action that you do not hold yourself.",
  ownership_is_role_only: "Organization administration comes only with the owner role.",
  cannot_deny_owner: "The organization's owner cannot be denied.",
  cannot_grant_self: "Another owner or admin must change your own permissions.",
  empty_grant: "Choose at least one action.",
} as const;

function grantDto(row: GrantRow, names: ReadonlyMap<string, string>, now = new Date()) {
  const status = row.revokedAt
    ? "revoked"
    : row.expiresAt && row.expiresAt <= now
      ? "expired"
      : "active";
  return {
    id: row.id,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    subjectName: names.get(row.subjectId) ?? null,
    effect: row.effect,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    actions: row.actions,
    reason: row.reason,
    status,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    createdByName: row.createdBy ? (names.get(row.createdBy) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

/** Agents and permission grants for the active organization. */
@Injectable()
export class AccessService {
  constructor(
    @Inject(APP_DB) private readonly db: Db | null,
    @Inject(AuthzService) private readonly authz: AuthzService,
  ) {}

  private get database(): Db {
    if (!this.db) throw new Error("AccessService used without a database");
    return this.db;
  }

  private scoped<T>(p: Principal, t: TenantContext, fn: (tx: Tx) => Promise<T>) {
    return withScope(this.database, { userId: p.userId, tenantId: t.tenantId }, fn);
  }

  private async findAgent(tx: Tx, tenantId: string, agentId: string): Promise<AgentRow> {
    const [row] = await tx
      .select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)));
    if (!row) throw notFound("Agent not found.");
    return row;
  }

  private async names(tx: Tx, tenantId: string): Promise<Map<string, string>> {
    // Sequential: one transaction is one connection, which runs one query at a time.
    const people = await tx
      .select({ id: users.id, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.tenantId, tenantId));
    const bots = await tx
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(eq(agents.tenantId, tenantId));
    return new Map([...people, ...bots].map((r) => [r.id, r.name]));
  }

  /** What the signed-in person may do here, and the grants that apply to them. */
  async myPermissions(p: Principal, t: TenantContext, actor: HumanActor) {
    const rows = await this.scoped(p, t, (tx) =>
      tx
        .select()
        .from(permissionGrants)
        .where(
          and(
            eq(permissionGrants.tenantId, t.tenantId),
            eq(permissionGrants.subjectType, "user"),
            eq(permissionGrants.subjectId, p.userId),
          ),
        )
        .orderBy(desc(permissionGrants.createdAt)),
    );
    return {
      role: t.role,
      permissions: effectivePermissions(actor),
      grants: rows.map((r) => grantDto(r, new Map())),
    };
  }

  async listAgents(p: Principal, t: TenantContext, actor: HumanActor) {
    const rows = await this.scoped(p, t, (tx) =>
      tx
        .select({ agent: agents, ownerName: users.name })
        .from(agents)
        .innerJoin(users, eq(users.id, agents.ownerUserId))
        .where(eq(agents.tenantId, t.tenantId))
        .orderBy(agents.createdAt),
    );
    return rows.map(({ agent, ownerName }) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      ownerUserId: agent.ownerUserId,
      ownerName,
      status: agent.status,
      createdAt: agent.createdAt.toISOString(),
      disabledAt: agent.disabledAt?.toISOString() ?? null,
      canManage: evaluate(actor, "write", {
        type: "agents",
        id: agent.id,
        ownerId: agent.ownerUserId,
      }).allowed,
    }));
  }

  /**
   * Register an agent the caller owns. It starts with the default agent
   * permissions (read the organization), never with the owner's full set.
   */
  async createAgent(
    p: Principal,
    t: TenantContext,
    actor: HumanActor,
    input: { name: string; description: string | null },
    correlationId: string,
  ) {
    this.authz.require(actor, "write", { type: "agents", ownerId: p.userId });
    return this.scoped(p, t, async (tx) => {
      const [row] = await tx
        .insert(agents)
        .values({
          tenantId: t.tenantId,
          name: input.name,
          description: input.description,
          ownerUserId: p.userId,
        })
        .returning();
      if (!row) throw new Error("agent insert returned nothing");
      await recordAudit(tx, {
        tenantId: t.tenantId,
        actorUserId: p.userId,
        action: "agent.created",
        targetType: "agent",
        targetId: row.id,
        correlationId,
      });
      return { id: row.id, name: row.name, status: row.status };
    });
  }

  async disableAgent(
    p: Principal,
    t: TenantContext,
    actor: HumanActor,
    agentId: string,
    correlationId: string,
  ) {
    await this.scoped(p, t, async (tx) => {
      const agent = await this.findAgent(tx, t.tenantId, agentId);
      this.authz.require(actor, "write", {
        type: "agents",
        id: agent.id,
        ownerId: agent.ownerUserId,
      });
      if (agent.status === "disabled")
        throw conflict("agent_disabled", "This agent is already disabled.");
      const now = new Date();
      const updated = await tx
        .update(agents)
        .set({ status: "disabled", disabledAt: now, disabledBy: p.userId, updatedAt: now })
        .where(and(eq(agents.id, agent.id), eq(agents.status, "active")))
        .returning({ id: agents.id });
      if (updated.length === 0) throw notFound("Agent not found.");
      await recordAudit(tx, {
        tenantId: t.tenantId,
        actorUserId: p.userId,
        action: "agent.disabled",
        targetType: "agent",
        targetId: agent.id,
        correlationId,
      });
    });
  }

  /** The agent's effective permissions next to its owner's. Visible to its owner and to admins. */
  async agentPermissions(p: Principal, t: TenantContext, actor: HumanActor, agentId: string) {
    return this.scoped(p, t, async (tx) => {
      const agent = await this.findAgent(tx, t.tenantId, agentId);
      const isOwner = agent.ownerUserId === p.userId;
      if (!isOwner) {
        const decision = evaluate(actor, "read", { type: "grants" });
        if (!decision.allowed) throw permissionDenied(decision);
      }
      const agentActor = await this.authz.agentActor(tx, agent);
      const names = await this.names(tx, t.tenantId);
      const grantRows = await tx
        .select()
        .from(permissionGrants)
        .where(
          and(
            eq(permissionGrants.tenantId, t.tenantId),
            eq(permissionGrants.subjectType, "agent"),
            eq(permissionGrants.subjectId, agent.id),
          ),
        )
        .orderBy(desc(permissionGrants.createdAt));
      return {
        agent: {
          id: agent.id,
          name: agent.name,
          status: agent.status,
          ownerUserId: agent.ownerUserId,
        },
        permissions: effectivePermissions(agentActor),
        ownerPermissions: effectivePermissions(agentActor.owner),
        grants: grantRows.map((r) => grantDto(r, names)),
      };
    });
  }

  async listGrants(p: Principal, t: TenantContext) {
    return this.scoped(p, t, async (tx) => {
      const rows = await tx
        .select()
        .from(permissionGrants)
        .where(eq(permissionGrants.tenantId, t.tenantId))
        .orderBy(desc(permissionGrants.createdAt))
        .limit(200);
      const names = await this.names(tx, t.tenantId);
      return rows.map((r) => grantDto(r, names));
    });
  }

  async createGrant(
    p: Principal,
    t: TenantContext,
    actor: HumanActor,
    input: CreateGrantInput,
    correlationId: string,
  ) {
    if (input.expiresAt && input.expiresAt <= new Date())
      throw badRequest("invalid_request", "The expiry must be in the future.");
    return this.scoped(p, t, async (tx) => {
      let isOrganizationOwner = false;
      if (input.subjectType === "user") {
        const [m] = await tx
          .select({ role: memberships.role })
          .from(memberships)
          .where(
            and(eq(memberships.tenantId, t.tenantId), eq(memberships.userId, input.subjectId)),
          );
        if (!m) throw notFound("No member with that id.");
        isOrganizationOwner = m.role === "owner";
      } else {
        await this.findAgent(tx, t.tenantId, input.subjectId);
      }
      const refusal = checkGrant(actor, {
        effect: input.effect,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        actions: input.actions,
        subject: {
          type: input.subjectType === "user" ? "human" : "agent",
          id: input.subjectId,
          isOrganizationOwner,
        },
      });
      if (refusal) {
        if (refusal === "grantor_cannot_manage_grants")
          throw permissionDenied(evaluate(actor, "admin", { type: "grants" }));
        throw badRequest(refusal, GRANT_REFUSAL_MESSAGES[refusal]);
      }
      if (input.subjectType === "user" && input.effect === "allow") {
        const allowed =
          input.resourceType === "*" ? undefined : HUMAN_ALLOW_GRANTABLE[input.resourceType];
        if (!allowed || !input.actions.every((a) => allowed.includes(a))) {
          throw badRequest(
            "grant_not_enforceable",
            "People can be given extra access to the audit log only; change their role for anything else.",
          );
        }
      }
      const [row] = await tx
        .insert(permissionGrants)
        .values({
          tenantId: t.tenantId,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          effect: input.effect,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          actions: [...new Set(input.actions)],
          reason: input.reason,
          expiresAt: input.expiresAt,
          createdBy: p.userId,
        })
        .returning();
      if (!row) throw new Error("grant insert returned nothing");
      await recordAudit(tx, {
        tenantId: t.tenantId,
        actorUserId: p.userId,
        action: "grant.created",
        targetType: "permission_grant",
        targetId: row.id,
        metadata: {
          subjectType: row.subjectType,
          subjectId: row.subjectId,
          effect: row.effect,
          resourceType: row.resourceType,
          resourceId: row.resourceId,
          actions: row.actions.join(","),
        },
        correlationId,
      });
      return grantDto(row, await this.names(tx, t.tenantId));
    });
  }

  async revokeGrant(
    p: Principal,
    t: TenantContext,
    actor: HumanActor,
    grantId: string,
    correlationId: string,
  ) {
    const decision = evaluate(actor, "admin", { type: "grants" });
    if (!decision.allowed) throw permissionDenied(decision);
    await this.scoped(p, t, async (tx) => {
      const updated = await tx
        .update(permissionGrants)
        .set({ revokedAt: new Date(), revokedBy: p.userId })
        .where(
          and(
            eq(permissionGrants.id, grantId),
            eq(permissionGrants.tenantId, t.tenantId),
            isNull(permissionGrants.revokedAt),
            // Nobody lifts a deny (or any grant) on themselves: another owner or admin must.
            or(ne(permissionGrants.subjectType, "user"), ne(permissionGrants.subjectId, p.userId)),
          ),
        )
        .returning();
      const row = updated[0];
      if (!row) throw notFound("No active grant with that id that you can revoke.");
      await recordAudit(tx, {
        tenantId: t.tenantId,
        actorUserId: p.userId,
        action: "grant.revoked",
        targetType: "permission_grant",
        targetId: row.id,
        metadata: { subjectType: row.subjectType, subjectId: row.subjectId, effect: row.effect },
        correlationId,
      });
    });
  }
}
