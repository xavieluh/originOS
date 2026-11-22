import { Inject, Injectable } from "@nestjs/common";
import { type ConsentPurpose, type Db, type Tx, schema, withScope } from "@originos/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { badRequest, conflict, notFound } from "../auth/errors.js";
import type { Principal, TenantContext } from "../auth/principal.js";
import { APP_DB } from "../auth/tokens.js";
import { recordAudit } from "../audit/audit.js";

const { consents } = schema;

/** Version of the consent wording below. Bump it when a description changes meaning. */
export const CONSENT_POLICY_VERSION = "2026-11-22";

type Subject = "user" | "organization";

interface PurposeInfo {
  readonly title: string;
  readonly description: string;
  readonly subjects: readonly Subject[];
  /** What scopeKey identifies, when a purpose can be given more than once. */
  readonly scopeKeyLabel: string | null;
}

/**
 * What each consent means. Recording consent here does not by itself turn any
 * collection or sharing on: the modules that need it (directory, telemetry,
 * connectors, partner policies) check for an active record before acting, and
 * stop when it is revoked. Those modules arrive in later phases.
 */
export const CONSENT_PURPOSES_INFO: Readonly<Record<ConsentPurpose, PurposeInfo>> = {
  identity_directory: {
    title: "Public identity directory",
    description: "List my verified identity claims in the public directory.",
    subjects: ["user"],
    scopeKeyLabel: null,
  },
  telemetry_collection: {
    title: "Agent telemetry collection",
    description:
      "Collect telemetry from agents and tools I instrument and route through OriginOS. Nothing outside those controls is collected.",
    subjects: ["user", "organization"],
    scopeKeyLabel: null,
  },
  data_sharing: {
    title: "Data sharing",
    description: "Share records I mark as shareable with the people or organizations I choose.",
    subjects: ["user", "organization"],
    scopeKeyLabel: null,
  },
  provider_scopes: {
    title: "Connected provider access",
    description:
      "Let OriginOS use a connected provider account with the scopes shown when it was connected.",
    subjects: ["user", "organization"],
    scopeKeyLabel: "Provider",
  },
  cross_org_policy: {
    title: "Cross-organization policy",
    description:
      "Allow a partner organization to rely on this organization's shared records under our policy.",
    subjects: ["organization"],
    scopeKeyLabel: "Partner organization",
  },
};

type ConsentRow = typeof consents.$inferSelect;

function consentDto(row: ConsentRow) {
  return {
    id: row.id,
    purpose: row.purpose,
    scopeKey: row.scopeKey,
    scope: row.scope,
    policyVersion: row.policyVersion,
    status: row.revokedAt ? ("revoked" as const) : ("active" as const),
    grantedAt: row.grantedAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

function isUniqueViolation(error: unknown): boolean {
  for (let e: unknown = error; e instanceof Error; e = e.cause)
    if ((e as { code?: string }).code === "23505") return true;
  return false;
}

/** Consent records: personal (each person's own) and organization policies. */
@Injectable()
export class ConsentService {
  constructor(@Inject(APP_DB) private readonly db: Db | null) {}

  private get database(): Db {
    if (!this.db) throw new Error("ConsentService used without a database");
    return this.db;
  }

  private scoped<T>(p: Principal, t: TenantContext, fn: (tx: Tx) => Promise<T>) {
    return withScope(this.database, { userId: p.userId, tenantId: t.tenantId }, fn);
  }

  private purposes(subject: Subject) {
    return Object.entries(CONSENT_PURPOSES_INFO)
      .filter(([, info]) => info.subjects.includes(subject))
      .map(([purpose, info]) => ({ purpose, ...info }));
  }

  private where(p: Principal, t: TenantContext, subject: Subject) {
    return subject === "user"
      ? and(
          eq(consents.tenantId, t.tenantId),
          eq(consents.subjectType, "user"),
          eq(consents.userId, p.userId),
        )
      : and(eq(consents.tenantId, t.tenantId), eq(consents.subjectType, "organization"));
  }

  /** Every consent record for the subject, active and revoked, newest first. */
  async list(p: Principal, t: TenantContext, subject: Subject) {
    const rows = await this.scoped(p, t, (tx) =>
      tx
        .select()
        .from(consents)
        .where(this.where(p, t, subject))
        .orderBy(desc(consents.grantedAt)),
    );
    return {
      policyVersion: CONSENT_POLICY_VERSION,
      purposes: this.purposes(subject),
      records: rows.map(consentDto),
    };
  }

  async give(
    p: Principal,
    t: TenantContext,
    subject: Subject,
    input: { purpose: ConsentPurpose; scopeKey: string },
    correlationId: string,
  ) {
    const info = CONSENT_PURPOSES_INFO[input.purpose];
    if (!info.subjects.includes(subject))
      throw badRequest(
        "invalid_purpose",
        `"${info.title}" is not a ${subject === "user" ? "personal" : "organization"} consent.`,
      );
    if (info.scopeKeyLabel && !input.scopeKey)
      throw badRequest(
        "scope_required",
        `Say which ${info.scopeKeyLabel.toLowerCase()} this covers.`,
      );
    if (!info.scopeKeyLabel && input.scopeKey)
      throw badRequest("invalid_request", "This consent does not take a scope.");
    try {
      return await this.scoped(p, t, async (tx) => {
        const [row] = await tx
          .insert(consents)
          .values({
            tenantId: t.tenantId,
            subjectType: subject,
            userId: subject === "user" ? p.userId : null,
            purpose: input.purpose,
            scopeKey: input.scopeKey,
            policyVersion: CONSENT_POLICY_VERSION,
            grantedBy: p.userId,
          })
          .returning();
        if (!row) throw new Error("consent insert returned nothing");
        await recordAudit(tx, {
          tenantId: t.tenantId,
          actorUserId: p.userId,
          action: "consent.granted",
          targetType: "consent",
          targetId: row.id,
          metadata: { subject, purpose: row.purpose, policyVersion: row.policyVersion },
          correlationId,
        });
        return consentDto(row);
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw conflict("consent_active", "That consent is already active.");
      throw error;
    }
  }

  async revoke(
    p: Principal,
    t: TenantContext,
    subject: Subject,
    consentId: string,
    correlationId: string,
  ) {
    await this.scoped(p, t, async (tx) => {
      const updated = await tx
        .update(consents)
        .set({ revokedAt: new Date(), revokedBy: p.userId })
        .where(
          and(eq(consents.id, consentId), this.where(p, t, subject), isNull(consents.revokedAt)),
        )
        .returning();
      const row = updated[0];
      if (!row) throw notFound("No active consent with that id.");
      await recordAudit(tx, {
        tenantId: t.tenantId,
        actorUserId: p.userId,
        action: "consent.revoked",
        targetType: "consent",
        targetId: row.id,
        metadata: { subject, purpose: row.purpose },
        correlationId,
      });
    });
  }
}
