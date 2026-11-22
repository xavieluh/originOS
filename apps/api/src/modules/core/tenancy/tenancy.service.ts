import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  type Db,
  type InvitableRole,
  type Role,
  type Tx,
  schema,
  setTenant,
  withScope,
} from "@originos/db";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Principal, TenantContext } from "../auth/principal.js";
import { badRequest, conflict, forbidden, notFound } from "../auth/errors.js";
import { APP_DB, MAILER, PUBLIC_ORIGIN } from "../auth/tokens.js";
import type { Mailer } from "../mail/mailer.js";
import { invitationMessage } from "../mail/templates.js";

const { organizations, memberships, invitations, users, sessions, auditEvents } = schema;

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export function invitationStatus(
  i: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date,
): InvitationStatus {
  if (i.acceptedAt) return "accepted";
  if (i.revokedAt) return "revoked";
  return i.expiresAt.getTime() <= now.getTime() ? "expired" : "pending";
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "org"}-${randomBytes(3).toString("hex")}`;
}

interface AuditInput {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly metadata?: Record<string, string | number | boolean | null>;
  readonly correlationId: string;
}

/**
 * Organizations, memberships, invitations and ownership. Every query runs
 * inside withScope(), so Postgres row-level security enforces the tenant
 * boundary even if a check here were wrong (ADR-023).
 */
@Injectable()
export class TenancyService {
  constructor(
    @Inject(APP_DB) private readonly db: Db | null,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(PUBLIC_ORIGIN) private readonly publicOrigin: string,
  ) {}

  private get database(): Db {
    if (!this.db) throw new Error("TenancyService used without a database");
    return this.db;
  }

  private audit(tx: Tx, input: AuditInput) {
    return tx.insert(auditEvents).values({ ...input, metadata: input.metadata ?? {} });
  }

  /** The active organization, only if the person is still a member of it. */
  async resolveTenant(principal: Principal): Promise<TenantContext | null> {
    const tenantId = principal.activeOrganizationId;
    if (!tenantId) return null;
    const rows = await withScope(this.database, { userId: principal.userId, tenantId }, (tx) =>
      tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, principal.userId))),
    );
    const role = rows[0]?.role;
    return role ? { tenantId, role } : null;
  }

  async listMemberships(userId: string) {
    return withScope(this.database, { userId }, (tx) =>
      tx
        .select({
          organizationId: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          role: memberships.role,
        })
        .from(memberships)
        .innerJoin(organizations, eq(organizations.id, memberships.tenantId))
        .where(eq(memberships.userId, userId))
        .orderBy(organizations.name),
    );
  }

  private async setActive(sessionId: string, userId: string, organizationId: string | null) {
    await this.database
      .update(sessions)
      .set({ activeOrganizationId: organizationId })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  }

  async switchOrganization(principal: Principal, organizationId: string) {
    const memberships = await this.listMemberships(principal.userId);
    const match = memberships.find((m) => m.organizationId === organizationId);
    // Same answer for "does not exist" and "not a member": no cross-org existence oracle.
    if (!match) throw notFound("Organization not found.");
    await this.setActive(principal.sessionId, principal.userId, organizationId);
    return match;
  }

  async createOrganization(principal: Principal, name: string, correlationId: string) {
    if (!principal.emailVerified)
      throw forbidden("Verify your email before creating an organization.");
    const id = randomUUID();
    const slug = slugify(name);
    await withScope(this.database, { userId: principal.userId, tenantId: id }, async (tx) => {
      await tx.insert(organizations).values({ id, name, slug, createdBy: principal.userId });
      await tx
        .insert(memberships)
        .values({ tenantId: id, userId: principal.userId, role: "owner" });
      await this.audit(tx, {
        tenantId: id,
        actorUserId: principal.userId,
        action: "organization.created",
        targetType: "organization",
        targetId: id,
        correlationId,
      });
    });
    await this.setActive(principal.sessionId, principal.userId, id);
    return { organizationId: id, name, slug, role: "owner" as Role };
  }

  async getOrganization(principal: Principal, tenant: TenantContext) {
    return withScope(
      this.database,
      { userId: principal.userId, tenantId: tenant.tenantId },
      async (tx) => {
        const [org] = await tx
          .select()
          .from(organizations)
          .where(eq(organizations.id, tenant.tenantId));
        if (!org) throw notFound("Organization not found.");
        const members = await tx
          .select({
            userId: users.id,
            name: users.name,
            email: users.email,
            role: memberships.role,
            joinedAt: memberships.createdAt,
          })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(eq(memberships.tenantId, tenant.tenantId))
          .orderBy(memberships.createdAt);
        return {
          organization: {
            id: org.id,
            name: org.name,
            slug: org.slug,
            createdAt: org.createdAt.toISOString(),
          },
          myRole: tenant.role,
          members: members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() })),
        };
      },
    );
  }

  async renameOrganization(
    principal: Principal,
    tenant: TenantContext,
    name: string,
    correlationId: string,
  ) {
    await withScope(
      this.database,
      { userId: principal.userId, tenantId: tenant.tenantId },
      async (tx) => {
        const updated = await tx
          .update(organizations)
          .set({ name })
          .where(eq(organizations.id, tenant.tenantId))
          .returning({ id: organizations.id });
        if (updated.length === 0) throw forbidden();
        await this.audit(tx, {
          tenantId: tenant.tenantId,
          actorUserId: principal.userId,
          action: "organization.renamed",
          targetType: "organization",
          targetId: tenant.tenantId,
          correlationId,
        });
      },
    );
  }

  async listInvitations(principal: Principal, tenant: TenantContext, now = new Date()) {
    const rows = await withScope(
      this.database,
      { userId: principal.userId, tenantId: tenant.tenantId },
      (tx) =>
        tx
          .select()
          .from(invitations)
          .where(eq(invitations.tenantId, tenant.tenantId))
          .orderBy(desc(invitations.createdAt)),
    );
    return rows.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      status: invitationStatus(i, now),
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
    }));
  }

  async createInvitation(
    principal: Principal,
    tenant: TenantContext,
    emailInput: string,
    role: InvitableRole,
    correlationId: string,
  ) {
    if (!this.mailer.configured) {
      throw conflict(
        "email_not_configured",
        "Invitations need email delivery, which is not configured (SMTP_URL).",
      );
    }
    const email = emailInput.trim().toLowerCase();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const result = await withScope(
      this.database,
      { userId: principal.userId, tenantId: tenant.tenantId },
      async (tx) => {
        const [org] = await tx
          .select({ name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, tenant.tenantId));
        if (!org) throw notFound("Organization not found.");
        const existing = await tx
          .select({ userId: users.id })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(
            and(eq(memberships.tenantId, tenant.tenantId), sql`lower(${users.email}) = ${email}`),
          );
        if (existing.length > 0)
          throw conflict("already_member", "That person is already a member.");
        // A newer invitation to the same email supersedes any pending one.
        await tx
          .update(invitations)
          .set({ revokedAt: new Date(), revokedBy: principal.userId })
          .where(
            and(
              eq(invitations.tenantId, tenant.tenantId),
              eq(invitations.email, email),
              sql`${invitations.acceptedAt} is null and ${invitations.revokedAt} is null`,
            ),
          );
        const [row] = await tx
          .insert(invitations)
          .values({
            tenantId: tenant.tenantId,
            email,
            role,
            tokenHash: hashToken(token),
            invitedBy: principal.userId,
            expiresAt,
          })
          .returning();
        if (!row) throw new Error("invitation insert returned nothing");
        await this.audit(tx, {
          tenantId: tenant.tenantId,
          actorUserId: principal.userId,
          action: "invitation.created",
          targetType: "invitation",
          targetId: row.id,
          metadata: { role },
          correlationId,
        });
        return { row, organizationName: org.name };
      },
    );
    // The token travels only in the URL fragment, which browsers never send to servers or put in logs.
    const url = `${this.publicOrigin}/invitations/accept#token=${token}`;
    await this.mailer.send(
      invitationMessage(email, url, principal.name, result.organizationName, role, expiresAt),
    );
    return {
      id: result.row.id,
      email,
      role,
      status: "pending" as InvitationStatus,
      expiresAt: expiresAt.toISOString(),
      createdAt: result.row.createdAt.toISOString(),
    };
  }

  async revokeInvitation(
    principal: Principal,
    tenant: TenantContext,
    invitationId: string,
    correlationId: string,
  ) {
    await withScope(
      this.database,
      { userId: principal.userId, tenantId: tenant.tenantId },
      async (tx) => {
        const updated = await tx
          .update(invitations)
          .set({ revokedAt: new Date(), revokedBy: principal.userId })
          .where(
            and(
              eq(invitations.id, invitationId),
              eq(invitations.tenantId, tenant.tenantId),
              sql`${invitations.acceptedAt} is null and ${invitations.revokedAt} is null`,
            ),
          )
          .returning({ id: invitations.id });
        if (updated.length === 0) throw notFound("No pending invitation with that id.");
        await this.audit(tx, {
          tenantId: tenant.tenantId,
          actorUserId: principal.userId,
          action: "invitation.revoked",
          targetType: "invitation",
          targetId: invitationId,
          correlationId,
        });
      },
    );
  }

  private async findInvitation(tx: Tx, token: string) {
    const [row] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, hashToken(token)));
    return row ?? null;
  }

  /** What the invitee sees before accepting. Organization name only, never the roster. */
  async lookupInvitation(principal: Principal, token: string, now = new Date()) {
    return withScope(
      this.database,
      { userId: principal.userId, invitationTokenHash: hashToken(token) },
      async (tx) => {
        const invitation = await this.findInvitation(tx, token);
        if (!invitation) throw notFound("This invitation link is not valid.");
        const status = invitationStatus(invitation, now);
        const name = await tx.execute<{ name: string | null }>(
          sql`select core.invitation_organization_name() as name`,
        );
        return {
          organizationName: name.rows[0]?.name ?? null,
          role: invitation.role,
          email: invitation.email,
          status,
          expiresAt: invitation.expiresAt.toISOString(),
          emailMatches: invitation.email === principal.email.toLowerCase(),
        };
      },
    );
  }

  async acceptInvitation(
    principal: Principal,
    token: string,
    correlationId: string,
    now = new Date(),
  ) {
    const accepted = await withScope(
      this.database,
      { userId: principal.userId, invitationTokenHash: hashToken(token) },
      async (tx) => {
        const invitation = await this.findInvitation(tx, token);
        if (!invitation) throw notFound("This invitation link is not valid.");
        const status = invitationStatus(invitation, now);
        if (status !== "pending")
          throw conflict(`invitation_${status}`, `This invitation has been ${status}.`);
        if (!principal.emailVerified)
          throw forbidden("Verify your email before accepting an invitation.");
        if (invitation.email !== principal.email.toLowerCase()) {
          throw forbidden(
            `This invitation was sent to a different email address. Sign in as ${invitation.email} to accept it.`,
          );
        }
        await setTenant(tx, invitation.tenantId);
        const already = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(
              eq(memberships.tenantId, invitation.tenantId),
              eq(memberships.userId, principal.userId),
            ),
          );
        if (already.length > 0)
          throw conflict("already_member", "You are already a member of this organization.");
        await tx.insert(memberships).values({
          tenantId: invitation.tenantId,
          userId: principal.userId,
          role: invitation.role,
        });
        await tx
          .update(invitations)
          .set({ acceptedAt: now, acceptedBy: principal.userId })
          .where(eq(invitations.id, invitation.id));
        await this.audit(tx, {
          tenantId: invitation.tenantId,
          actorUserId: principal.userId,
          action: "member.joined",
          targetType: "membership",
          targetId: principal.userId,
          metadata: { role: invitation.role, invitationId: invitation.id },
          correlationId,
        });
        return invitation;
      },
    );
    await this.setActive(principal.sessionId, principal.userId, accepted.tenantId);
    return { organizationId: accepted.tenantId, role: accepted.role };
  }

  async changeRole(
    principal: Principal,
    tenant: TenantContext,
    userId: string,
    role: InvitableRole,
    correlationId: string,
  ) {
    if (userId === principal.userId)
      throw badRequest("cannot_change_own_role", "You cannot change your own role.");
    await withScope(
      this.database,
      { userId: principal.userId, tenantId: tenant.tenantId },
      async (tx) => {
        const updated = await tx
          .update(memberships)
          .set({ role })
          .where(and(eq(memberships.tenantId, tenant.tenantId), eq(memberships.userId, userId)))
          .returning({ id: memberships.id });
        if (updated.length === 0)
          throw notFound(
            "No changeable member with that id. The owner's role changes only by transfer.",
          );
        await this.audit(tx, {
          tenantId: tenant.tenantId,
          actorUserId: principal.userId,
          action: "member.role_changed",
          targetType: "membership",
          targetId: userId,
          metadata: { role },
          correlationId,
        });
      },
    );
  }

  async removeMember(
    principal: Principal,
    tenant: TenantContext,
    userId: string,
    correlationId: string,
  ) {
    const self = userId === principal.userId;
    if (!self && tenant.role === "member") throw forbidden();
    await withScope(
      this.database,
      { userId: principal.userId, tenantId: tenant.tenantId },
      async (tx) => {
        // Audit first: once the actor leaves, RLS no longer lets them write this tenant's log.
        await this.audit(tx, {
          tenantId: tenant.tenantId,
          actorUserId: principal.userId,
          action: self ? "member.left" : "member.removed",
          targetType: "membership",
          targetId: userId,
          correlationId,
        });
        const removed = await tx
          .delete(memberships)
          .where(and(eq(memberships.tenantId, tenant.tenantId), eq(memberships.userId, userId)))
          .returning({ id: memberships.id });
        if (removed.length === 0) {
          throw self
            ? conflict("owner_cannot_leave", "Transfer ownership before leaving this organization.")
            : notFound("No removable member with that id. The owner cannot be removed.");
        }
      },
    );
    if (self) await this.setActive(principal.sessionId, principal.userId, null);
  }

  async transferOwnership(
    principal: Principal,
    tenant: TenantContext,
    newOwnerId: string,
    correlationId: string,
  ) {
    await withScope(
      this.database,
      { userId: principal.userId, tenantId: tenant.tenantId },
      async (tx) => {
        const result = await tx.execute<{ ok: boolean }>(
          sql`select core.transfer_ownership(${newOwnerId}) as ok`,
        );
        if (!result.rows[0]?.ok)
          throw badRequest(
            "transfer_not_allowed",
            "Ownership can only move from the owner to another current member.",
          );
        await this.audit(tx, {
          tenantId: tenant.tenantId,
          actorUserId: principal.userId,
          action: "ownership.transferred",
          targetType: "membership",
          targetId: newOwnerId,
          metadata: { previousOwner: principal.userId },
          correlationId,
        });
      },
    );
  }

  async listAuditEvents(principal: Principal, tenant: TenantContext) {
    const rows = await withScope(
      this.database,
      { userId: principal.userId, tenantId: tenant.tenantId },
      (tx) =>
        tx
          .select({
            id: auditEvents.id,
            action: auditEvents.action,
            targetType: auditEvents.targetType,
            targetId: auditEvents.targetId,
            actorUserId: auditEvents.actorUserId,
            actorName: users.name,
            metadata: auditEvents.metadata,
            occurredAt: auditEvents.occurredAt,
          })
          .from(auditEvents)
          .leftJoin(users, eq(users.id, auditEvents.actorUserId))
          .where(eq(auditEvents.tenantId, tenant.tenantId))
          .orderBy(desc(auditEvents.occurredAt))
          .limit(50),
    );
    return rows.map((r) => ({ ...r, occurredAt: r.occurredAt.toISOString() }));
  }
}
