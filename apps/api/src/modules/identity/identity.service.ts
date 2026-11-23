// IdentityMesh (Phase 09, ADR-028): creator and organization profiles,
// ownership proofs, the review queue, moderation and the public projection.
//
// What is enforced where:
//  * the database (migration 0011) refuses a verified domain proof that did
//    not come from the worker's challenge check, self-decided reviews, edits
//    to decisions, moderation by non-admins and owner changes without an
//    approved request; this service checks the same rules first so people get
//    clear errors;
//  * badges are computed from proofs and reviews on every read
//    (@originos/identity), so "expired" can never be shown as current;
//  * the public projection is built from SECURITY DEFINER functions that
//    return presentation fields only: no account names, emails, user,
//    subject or organization ids.
import { createHash } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  type AccountProofCallback,
  type AccountProofProvider,
  type BadgeView,
  type DomainProofStart,
  IDENTITY_CHECK_DOMAIN_JOB,
  type ModerationInput,
  type ProfileCreate,
  type ProfileDetail,
  type ProfileUpdate,
  type ProfileView,
  type ProofView,
  type PublicProfileView,
  RESERVED_HANDLES,
  type ReviewDecisionInput,
  type ReviewRequest,
  type ReviewView,
  newId,
  newProofId,
  newReviewId,
} from "@originos/contracts";
import {
  type Connect,
  ProviderError,
  authorizeUrl,
  exchangeCode,
  fetchIdentity,
  findProvider,
} from "@originos/connect";
import { type Db, type Tx, enqueueJob, schema, withScope } from "@originos/db";
import {
  type ProofFacts,
  type ReviewFacts,
  badgesFor,
  expiryFrom,
  instructions,
  newChallenge,
  normalizeDomain,
} from "@originos/identity";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { beginAttempt, consumeAttempt } from "../connect/index.js";
import {
  APP_DB,
  ApiError,
  type Principal,
  type TenantContext,
  badRequest,
  conflict,
  forbidden,
  notFound,
  recordAudit,
} from "../core/index.js";
import { IDENTITY_CONNECT, IDENTITY_PUBLIC_ORIGIN } from "./tokens.js";

const {
  profiles,
  identityProofs: proofs,
  identityReviews: reviews,
  identityClaims: claims,
  subjects,
  organizations,
} = schema;

type ProfileRow = typeof profiles.$inferSelect;
type ProofRow = typeof proofs.$inferSelect;
type ReviewRow = typeof reviews.$inferSelect;

/** Shown on public pages instead of the organization's name, which could locate a pseudonymous creator. */
const PUBLIC_REVIEWER = "the organization that hosts this profile";

const iso = (d: Date | null) => d?.toISOString() ?? null;

function evidenceHash(input: ReviewRequest): string {
  const canonical =
    input.kind === "claim"
      ? {
          kind: input.kind,
          claimType: input.claimType,
          statement: input.statement,
          evidence: input.evidence,
        }
      : {
          kind: input.kind,
          reason: input.reason,
          statement: input.statement,
          evidence: input.evidence,
        };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const e = error as { code?: string; constraint?: string; cause?: unknown };
  if (e?.code === "23505" && e.constraint === constraint) return true;
  return e?.cause ? isUniqueViolation(e.cause, constraint) : false;
}

const proofFacts = (r: ProofRow | (Omit<ProofFacts, "id"> & { id: string })): ProofFacts => ({
  id: r.id,
  kind: r.kind,
  method: r.method,
  label: r.label,
  provider: r.provider,
  status: r.status,
  lastVerifiedAt: r.lastVerifiedAt,
  expiresAt: r.expiresAt,
  staleReason: r.staleReason,
  revokedAt: r.revokedAt,
  revokedReason: r.revokedReason,
});

@Injectable()
export class IdentityService {
  constructor(
    @Inject(APP_DB) private readonly db: Db | null,
    @Inject(IDENTITY_CONNECT) private readonly connect: Connect,
    @Inject(IDENTITY_PUBLIC_ORIGIN) private readonly publicOrigin: string,
  ) {}

  private get database(): Db {
    if (!this.db) throw new Error("IdentityService used without a database");
    return this.db;
  }

  private scoped<T>(p: Principal, t: TenantContext, fn: (tx: Tx) => Promise<T>) {
    return withScope(this.database, { userId: p.userId, tenantId: t.tenantId }, fn);
  }

  private providerNames(): Record<string, string> {
    return Object.fromEntries(
      this.connect.providers.map((c) => [c.definition.id, c.definition.name]),
    );
  }

  // --- Subjects ---------------------------------------------------------------

  /** The current person's subject in this organization, registered on first use. */
  private async mySubject(tx: Tx, p: Principal, t: TenantContext, displayName: string) {
    const [existing] = await tx
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.tenantId, t.tenantId), eq(subjects.userId, p.userId)));
    if (existing) return existing.id;
    const id = newId("subject");
    await tx
      .insert(subjects)
      .values({ id, tenantId: t.tenantId, kind: "human", displayName, userId: p.userId });
    return id;
  }

  // --- Profiles -------------------------------------------------------------

  private profileColumns(p: Principal) {
    return {
      row: profiles,
      canManage: sql<boolean>`trust.can_manage_profile(${profiles.id})`,
      isMine: sql<boolean>`(${profiles.kind} = 'creator' and ${subjects.userId} is not distinct from ${p.userId}::uuid)`,
    };
  }

  private toProfileView(r: { row: ProfileRow; canManage: boolean; isMine: boolean }): ProfileView {
    const { row } = r;
    return {
      id: row.id,
      kind: row.kind,
      handle: row.handle,
      displayName: row.displayName,
      bio: row.bio,
      visibility: row.visibility,
      pseudonymous: row.pseudonymous,
      discoverable: row.discoverable,
      moderationState: row.moderationState,
      moderationReason: row.moderationReason,
      canManage: Boolean(r.canManage),
      isMine: Boolean(r.isMine),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async loadProfile(tx: Tx, p: Principal, t: TenantContext, id: string) {
    const [r] = await tx
      .select(this.profileColumns(p))
      .from(profiles)
      .innerJoin(
        subjects,
        and(eq(subjects.tenantId, profiles.tenantId), eq(subjects.id, profiles.subjectId)),
      )
      .where(and(eq(profiles.id, id), eq(profiles.tenantId, t.tenantId)));
    if (!r) throw notFound("No such profile.");
    return r;
  }

  private async manageable(tx: Tx, p: Principal, t: TenantContext, id: string) {
    const r = await this.loadProfile(tx, p, t, id);
    if (!r.canManage) throw forbidden("Only the profile's owner can change it.");
    if (r.row.moderationState === "suspended" && !this.isAdmin(t))
      throw conflict(
        "profile_suspended",
        "This profile is suspended. An owner or admin of the organization can lift the suspension.",
      );
    return r;
  }

  private isAdmin(t: TenantContext) {
    return t.role === "owner" || t.role === "admin";
  }

  async list(p: Principal, t: TenantContext): Promise<ProfileView[]> {
    const rows = await this.scoped(p, t, (tx) =>
      tx
        .select(this.profileColumns(p))
        .from(profiles)
        .innerJoin(
          subjects,
          and(eq(subjects.tenantId, profiles.tenantId), eq(subjects.id, profiles.subjectId)),
        )
        .where(eq(profiles.tenantId, t.tenantId))
        .orderBy(asc(profiles.kind), asc(profiles.handle))
        .limit(200),
    );
    return rows.map((r) => this.toProfileView(r));
  }

  private checkHandle(handle: string) {
    if (RESERVED_HANDLES.has(handle))
      throw badRequest("handle_reserved", "That handle is reserved. Choose another.");
  }

  private handleTaken(error: unknown): never {
    if (isUniqueViolation(error, "profiles_handle_uq"))
      throw conflict("handle_taken", "That handle is taken. Choose another.");
    if (isUniqueViolation(error, "profiles_one_org_profile_uq"))
      throw conflict("organization_profile_exists", "This organization already has a profile.");
    throw error;
  }

  async create(
    p: Principal,
    t: TenantContext,
    input: ProfileCreate,
    correlationId: string,
  ): Promise<ProfileDetail> {
    this.checkHandle(input.handle);
    if (input.kind === "organization" && !this.isAdmin(t))
      throw forbidden("Only owners and admins create the organization's profile.");
    let id: string;
    try {
      id = await this.scoped(p, t, async (tx) => {
        let subjectId: string;
        if (input.kind === "creator") {
          subjectId = await this.mySubject(tx, p, t, input.displayName);
        } else {
          subjectId = newId("subject");
          await tx.insert(subjects).values({
            id: subjectId,
            tenantId: t.tenantId,
            kind: "organization",
            displayName: input.displayName,
          });
        }
        const [row] = await tx
          .insert(profiles)
          .values({
            tenantId: t.tenantId,
            subjectId,
            kind: input.kind,
            handle: input.handle,
            displayName: input.displayName,
            bio: input.bio || null,
            visibility: input.visibility,
            pseudonymous: input.pseudonymous,
            discoverable: input.discoverable,
            createdByUserId: p.userId,
          })
          .returning({ id: profiles.id });
        await recordAudit(tx, {
          tenantId: t.tenantId,
          actorUserId: p.userId,
          action: "identity.profile_created",
          targetType: "profile",
          targetId: row!.id,
          metadata: { kind: input.kind, visibility: input.visibility },
          correlationId,
        });
        return row!.id;
      });
    } catch (error) {
      this.handleTaken(error);
    }
    return this.detail(p, t, id);
  }

  async update(
    p: Principal,
    t: TenantContext,
    id: string,
    input: ProfileUpdate,
    correlationId: string,
  ): Promise<ProfileDetail> {
    if (input.handle) this.checkHandle(input.handle);
    try {
      await this.scoped(p, t, async (tx) => {
        await this.manageable(tx, p, t, id);
        const set: Partial<typeof profiles.$inferInsert> = {};
        if (input.handle !== undefined) set.handle = input.handle;
        if (input.displayName !== undefined) set.displayName = input.displayName;
        if (input.bio !== undefined) set.bio = input.bio || null;
        if (input.visibility !== undefined) set.visibility = input.visibility;
        if (input.pseudonymous !== undefined) set.pseudonymous = input.pseudonymous;
        if (input.discoverable !== undefined) set.discoverable = input.discoverable;
        if (Object.keys(set).length === 0) return;
        await tx.update(profiles).set(set).where(eq(profiles.id, id));
        await recordAudit(tx, {
          tenantId: t.tenantId,
          actorUserId: p.userId,
          action: "identity.profile_updated",
          targetType: "profile",
          targetId: id,
          metadata: { fields: Object.keys(set).sort().join(",") },
          correlationId,
        });
      });
    } catch (error) {
      this.handleTaken(error);
    }
    return this.detail(p, t, id);
  }

  async moderate(
    p: Principal,
    t: TenantContext,
    id: string,
    input: ModerationInput,
    correlationId: string,
  ): Promise<ProfileDetail> {
    if (!this.isAdmin(t)) throw forbidden("Only owners and admins moderate profiles.");
    await this.scoped(p, t, async (tx) => {
      const { row } = await this.loadProfile(tx, p, t, id);
      if (row.moderationState === input.state && input.state === "active") return;
      await tx
        .update(profiles)
        .set({
          moderationState: input.state,
          moderationReason: input.state === "active" ? null : input.reason,
          moderatedAt: new Date(),
          moderatedByUserId: p.userId,
        })
        .where(eq(profiles.id, id));
      // The reason stays on the profile; the audit event carries states only.
      await recordAudit(tx, {
        tenantId: t.tenantId,
        actorUserId: p.userId,
        action: "identity.profile_moderated",
        targetType: "profile",
        targetId: id,
        metadata: { from: row.moderationState, to: input.state },
        correlationId,
      });
    });
    return this.detail(p, t, id);
  }

  async detail(p: Principal, t: TenantContext, id: string): Promise<ProfileDetail> {
    return this.scoped(p, t, async (tx) => {
      const r = await this.loadProfile(tx, p, t, id);
      const proofRows = await tx
        .select()
        .from(proofs)
        .where(eq(proofs.profileId, id))
        .orderBy(desc(proofs.createdAt));
      const reviewViews = await this.reviewViews(
        tx,
        p,
        t,
        and(eq(reviews.profileId, id), eq(reviews.tenantId, t.tenantId)),
      );
      const [org] = await tx
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, t.tenantId));
      const reviewRows = await tx
        .select()
        .from(reviews)
        .where(and(eq(reviews.profileId, id), eq(reviews.kind, "claim")));
      const badges = badgesFor({
        proofs: proofRows.map(proofFacts),
        reviews: reviewRows.map((rv) => this.reviewFacts(rv, org?.name ?? "this organization")),
        providerNames: this.providerNames(),
      });
      return {
        profile: this.toProfileView(r),
        proofs: proofRows.map((x) => this.toProofView(x)),
        badges,
        reviews: reviewViews,
        canModerate: this.isAdmin(t),
      };
    });
  }

  // --- Proofs ---------------------------------------------------------------

  private toProofView(r: ProofRow): ProofView {
    return {
      id: r.id,
      profileId: r.profileId,
      kind: r.kind,
      method: r.method,
      label: r.label,
      provider: r.provider,
      status: r.status,
      visibility: r.visibility,
      instructions:
        r.kind === "domain" && r.challenge && r.status !== "revoked"
          ? instructions(r.target, r.method as "dns_txt" | "html_file", r.challenge)
          : null,
      firstVerifiedAt: iso(r.firstVerifiedAt),
      lastVerifiedAt: iso(r.lastVerifiedAt),
      expiresAt: iso(r.expiresAt),
      lastCheckedAt: iso(r.lastCheckedAt),
      lastCheckError: r.lastCheckError,
      staleReason: r.staleReason,
      revokedAt: iso(r.revokedAt),
      revokedReason: r.revokedReason,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private async loadProof(tx: Tx, profileId: string, proofId: string) {
    const [row] = await tx
      .select()
      .from(proofs)
      .where(and(eq(proofs.id, proofId), eq(proofs.profileId, profileId)));
    if (!row) throw notFound("No such proof.");
    return row;
  }

  /** Issue a domain challenge. Nothing is verified until the worker finds the value. */
  async startDomainProof(
    p: Principal,
    t: TenantContext,
    profileId: string,
    input: DomainProofStart,
    correlationId: string,
  ): Promise<ProofView> {
    const domain = normalizeDomain(input.domain);
    if (!domain.ok) throw badRequest("invalid_domain", domain.reason);
    try {
      return await this.scoped(p, t, async (tx) => {
        await this.manageable(tx, p, t, profileId);
        const [row] = await tx
          .insert(proofs)
          .values({
            id: newProofId(),
            tenantId: t.tenantId,
            profileId,
            kind: "domain",
            method: input.method,
            target: domain.domain,
            label: domain.domain,
            challenge: newChallenge(),
            visibility: input.visibility,
            createdByUserId: p.userId,
          })
          .returning();
        await recordAudit(tx, {
          tenantId: t.tenantId,
          actorUserId: p.userId,
          action: "identity.proof_started",
          targetType: "identity_proof",
          targetId: row!.id,
          metadata: { profileId, kind: "domain", method: input.method },
          correlationId,
        });
        return this.toProofView(row!);
      });
    } catch (error) {
      if (isUniqueViolation(error, "identity_proofs_live_uq"))
        throw conflict(
          "proof_exists",
          "This profile already has a proof for that domain. Check it, or withdraw it first.",
        );
      throw error;
    }
  }

  /** Ask the worker to look for the challenge now (first check or re-check). */
  async checkProof(
    p: Principal,
    t: TenantContext,
    profileId: string,
    proofId: string,
    correlationId: string,
  ): Promise<{ jobId: string }> {
    return this.scoped(p, t, async (tx) => {
      await this.manageable(tx, p, t, profileId);
      const proof = await this.loadProof(tx, profileId, proofId);
      if (proof.status === "revoked")
        throw conflict("proof_revoked", "This proof was revoked. Start a new one.");
      if (proof.kind !== "domain")
        throw conflict(
          "reprove_account",
          "Account proofs are re-checked by proving the account again.",
        );
      const job = await enqueueJob(tx, {
        tenantId: t.tenantId,
        type: IDENTITY_CHECK_DOMAIN_JOB,
        payload: { proofId },
        subjectRef: proofId,
        // One queued check per finished check: repeated clicks while a check is
        // waiting add nothing, and a new check is possible once it has run.
        idempotencyKey: `check:${proofId}:${proof.checkCount}`,
        maxAttempts: 3,
        createdByUserId: p.userId,
        correlationId,
      });
      await recordAudit(tx, {
        tenantId: t.tenantId,
        actorUserId: p.userId,
        action: "identity.proof_check_requested",
        targetType: "identity_proof",
        targetId: proofId,
        metadata: { jobId: job.id },
        correlationId,
      });
      return { jobId: job.id };
    });
  }

  async setProofVisibility(
    p: Principal,
    t: TenantContext,
    profileId: string,
    proofId: string,
    visibility: "public" | "tenant",
    correlationId: string,
  ): Promise<ProofView> {
    return this.scoped(p, t, async (tx) => {
      await this.manageable(tx, p, t, profileId);
      const proof = await this.loadProof(tx, profileId, proofId);
      if (proof.status === "revoked") return this.toProofView(proof);
      const [row] = await tx
        .update(proofs)
        .set({ visibility })
        .where(eq(proofs.id, proofId))
        .returning();
      await recordAudit(tx, {
        tenantId: t.tenantId,
        actorUserId: p.userId,
        action: "identity.proof_visibility_changed",
        targetType: "identity_proof",
        targetId: proofId,
        metadata: { visibility },
        correlationId,
      });
      return this.toProofView(row!);
    });
  }

  /**
   * Withdraw a proof (its owner) or revoke it (an owner or admin of the
   * organization). The identity claim it backed is revoked too; the rows stay.
   */
  async revokeProof(
    p: Principal,
    t: TenantContext,
    profileId: string,
    proofId: string,
    correlationId: string,
  ): Promise<ProofView> {
    return this.scoped(p, t, async (tx) => {
      const { canManage } = await this.loadProfile(tx, p, t, profileId);
      if (!canManage && !this.isAdmin(t))
        throw forbidden("Only the profile's owner, or an owner or admin, can revoke a proof.");
      const proof = await this.loadProof(tx, profileId, proofId);
      if (proof.status === "revoked") return this.toProofView(proof);
      const reason = canManage ? "withdrawn" : "reviewer";
      const [row] = await this.revokeProofRows(tx, p, [proof], reason);
      await recordAudit(tx, {
        tenantId: t.tenantId,
        actorUserId: p.userId,
        action: "identity.proof_revoked",
        targetType: "identity_proof",
        targetId: proofId,
        metadata: { reason },
        correlationId,
      });
      return this.toProofView(row!);
    });
  }

  private async revokeProofRows(
    tx: Tx,
    p: Principal,
    rows: readonly ProofRow[],
    reason: "withdrawn" | "ownership_changed" | "reviewer",
  ): Promise<ProofRow[]> {
    const live = rows.filter((r) => r.status !== "revoked");
    if (live.length === 0) return [];
    const now = new Date();
    const updated = await tx
      .update(proofs)
      .set({ status: "revoked", revokedAt: now, revokedReason: reason, revokedByUserId: p.userId })
      .where(
        inArray(
          proofs.id,
          live.map((r) => r.id),
        ),
      )
      .returning();
    const claimIds = live.map((r) => r.claimId).filter((c): c is string => c !== null);
    if (claimIds.length > 0)
      await tx.update(claims).set({ revokedAt: now }).where(inArray(claims.id, claimIds));
    return updated;
  }

  // --- Account proofs (OAuth) -----------------------------------------------

  accountProviders(): AccountProofProvider[] {
    return this.connect.providers.map((c) => ({
      id: c.definition.id,
      name: c.definition.name,
      testOnly: c.definition.testOnly,
      configured: c.missing.length === 0,
      setupHint:
        c.missing.length === 0
          ? null
          : `An operator sets ${c.missing.join(", ")} for the API. See docs/DEVELOPMENT.md.`,
    }));
  }

  private accountProvider(id: string) {
    const config = findProvider(this.connect, id);
    if (!config) throw notFound("No such provider.");
    if (config.missing.length > 0)
      throw new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "provider_not_configured",
        `${config.definition.name} is not set up for this deployment.`,
      );
    return config;
  }

  /**
   * The callback reuses the provider's registered callback URL with an
   * /identity suffix (GitHub allows sub-paths of the registered URL).
   */
  redirectUri(providerId: string): string {
    return `${this.publicOrigin}/integrations/callback/${providerId}/identity`;
  }

  /** Begin an account proof: no scopes are requested, and no token is kept afterwards. */
  async startAccountProof(
    p: Principal,
    t: TenantContext,
    profileId: string,
    providerId: string,
    correlationId: string,
  ): Promise<{ authorizeUrl: string }> {
    const config = this.accountProvider(providerId);
    const redirectUri = this.redirectUri(providerId);
    const attempt = await this.scoped(p, t, async (tx) => {
      await this.manageable(tx, p, t, profileId);
      const a = await beginAttempt(tx, {
        tenantId: t.tenantId,
        userId: p.userId,
        provider: providerId,
        purpose: "identity_proof",
        profileId,
        redirectUri,
        scopes: [],
      });
      await recordAudit(tx, {
        tenantId: t.tenantId,
        actorUserId: p.userId,
        action: "identity.account_proof_started",
        targetType: "profile",
        targetId: profileId,
        metadata: { provider: providerId },
        correlationId,
      });
      return a;
    });
    return {
      authorizeUrl: authorizeUrl(config, {
        redirectUri,
        state: attempt.state,
        challenge: attempt.challenge,
        scopes: [],
      }),
    };
  }

  /**
   * Finish an account proof. The attempt is consumed before the code is
   * exchanged; the access token is used once to read the account's id and
   * login and then dropped (never stored, never logged).
   */
  async accountCallback(
    p: Principal,
    t: TenantContext,
    input: AccountProofCallback,
    correlationId: string,
  ): Promise<{ profileId: string; proof: ProofView }> {
    const config = this.accountProvider(input.provider);
    const attempt = await this.scoped(p, t, (tx) =>
      consumeAttempt(tx, {
        state: input.state,
        provider: input.provider,
        purpose: "identity_proof",
      }),
    );
    const profileId = attempt.profileId!;
    let identity;
    try {
      const tokens = await exchangeCode(config, {
        code: input.code,
        redirectUri: attempt.redirectUri,
        verifier: attempt.codeVerifier,
        scopes: attempt.scopes,
      });
      identity = await fetchIdentity(config, tokens.accessToken);
    } catch (error) {
      if (error instanceof ProviderError) {
        await this.scoped(p, t, (tx) =>
          recordAudit(tx, {
            tenantId: t.tenantId,
            actorUserId: p.userId,
            action: "identity.account_proof_failed",
            targetType: "profile",
            targetId: profileId,
            metadata: { provider: input.provider, reason: error.kind },
            correlationId,
          }),
        );
        throw new ApiError(
          error.kind === "unavailable" ? HttpStatus.BAD_GATEWAY : HttpStatus.BAD_REQUEST,
          error.kind === "invalid_grant" ? "provider_rejected_code" : "provider_error",
          "The provider could not confirm the account. Try again.",
        );
      }
      throw error;
    }

    const proof = await this.scoped(p, t, async (tx) => {
      const { row: profile } = await this.manageable(tx, p, t, profileId);
      const recorder = await this.mySubject(tx, p, t, profile.displayName);
      const target = `${input.provider}:${identity.id}`;
      const now = new Date();
      const claimId = newId("identity_claim");
      const [existing] = await tx
        .select()
        .from(proofs)
        .where(
          and(
            eq(proofs.profileId, profileId),
            eq(proofs.kind, "account"),
            eq(proofs.target, target),
            ne(proofs.status, "revoked"),
          ),
        );
      await tx.insert(claims).values({
        id: claimId,
        tenantId: t.tenantId,
        createdBySubjectId: recorder,
        visibility: existing?.visibility ?? "public",
        sourceProvider: input.provider,
        firstSeenAt: now,
        assertedBySubjectId: profile.subjectId,
        captureMethod: "challenge",
        validationMechanism: "oauth2_authorization_code_pkce",
        assurance: "domain_or_account_controlled",
        limitations: `Shows that whoever runs this profile signed in to the ${config.definition.name} account ${identity.label} on ${now.toISOString().slice(0, 10)}. It does not show legal identity.`,
        subjectId: profile.subjectId,
        claimType: "account_control",
        value: target,
      });
      const verified = {
        status: "verified" as const,
        label: identity.label,
        lastVerifiedAt: now,
        expiresAt: expiryFrom("account", now),
        staleReason: null,
        staleAt: null,
        claimId,
      };
      let row: ProofRow;
      if (existing) {
        if (existing.claimId)
          await tx
            .update(claims)
            .set({ supersededById: claimId })
            .where(eq(claims.id, existing.claimId));
        [row] = (await tx
          .update(proofs)
          .set(verified)
          .where(eq(proofs.id, existing.id))
          .returning()) as [ProofRow];
      } else {
        [row] = (await tx
          .insert(proofs)
          .values({
            id: newProofId(),
            tenantId: t.tenantId,
            profileId,
            kind: "account",
            method: "oauth",
            target,
            provider: input.provider,
            firstVerifiedAt: now,
            createdByUserId: p.userId,
            ...verified,
          })
          .returning()) as [ProofRow];
      }
      // Anyone else who proved this account is now stale: control may have moved.
      await tx.execute(sql`select trust.mark_control_moved(${row.id})`);
      await recordAudit(tx, {
        tenantId: t.tenantId,
        actorUserId: p.userId,
        action: "identity.account_proved",
        targetType: "identity_proof",
        targetId: row.id,
        metadata: { provider: input.provider, claimId, profileId },
        correlationId,
      });
      return row;
    });
    return { profileId, proof: this.toProofView(proof) };
  }

  // --- Review queue -----------------------------------------------------------

  private reviewFacts(r: ReviewRow, reviewerLabel: string): ReviewFacts {
    return {
      id: r.id,
      claimType: r.claimType,
      statement: r.statement,
      status: r.status,
      decidedAt: r.decidedAt,
      revokedAt: r.revokedAt,
      reviewerLabel,
    };
  }

  private async reviewViews(
    tx: Tx,
    p: Principal,
    t: TenantContext,
    where: ReturnType<typeof and>,
  ): Promise<ReviewView[]> {
    const requester = sql<
      string | null
    >`(select name from core.users u where u.id = ${reviews.requestedByUserId})`;
    const decider = sql<
      string | null
    >`(select name from core.users u where u.id = ${reviews.decidedByUserId})`;
    const rows = await tx
      .select({
        r: reviews,
        handle: profiles.handle,
        displayName: profiles.displayName,
        requesterName: requester,
        deciderName: decider,
      })
      .from(reviews)
      .innerJoin(
        profiles,
        and(eq(profiles.tenantId, reviews.tenantId), eq(profiles.id, reviews.profileId)),
      )
      .where(where)
      .orderBy(desc(reviews.createdAt))
      .limit(200);
    const out: ReviewView[] = [];
    for (const { r, handle, displayName, requesterName, deciderName } of rows) {
      out.push({
        id: r.id,
        profileId: r.profileId,
        profileHandle: handle,
        profileDisplayName: displayName,
        kind: r.kind,
        status: r.status,
        claimType: r.claimType,
        ownershipReason: r.ownershipReason,
        statement: r.statement,
        evidence: r.evidence,
        matchingProofs: r.kind === "ownership" ? await this.matchingProofs(tx, r) : [],
        evidenceHash: r.evidenceHash,
        visibility: r.visibility,
        requestedBy: { userId: r.requestedByUserId, name: requesterName },
        isMine: r.requestedByUserId === p.userId,
        canDecide: r.status === "pending" && this.isAdmin(t) && r.requestedByUserId !== p.userId,
        decidedBy: r.decidedAt ? { userId: r.decidedByUserId, name: deciderName } : null,
        decidedAt: iso(r.decidedAt),
        decisionReason: r.decisionReason,
        revokedAt: iso(r.revokedAt),
        revokedReason: r.revokedReason,
        createdAt: r.createdAt.toISOString(),
      });
    }
    return out;
  }

  /**
   * Server-computed evidence for an ownership request: the profile's proven
   * domains and accounts, and whether the requester's own profiles in this
   * organization hold a verified proof of the same thing today.
   */
  private async matchingProofs(tx: Tx, r: ReviewRow) {
    const target = await tx
      .select({ kind: proofs.kind, target: proofs.target, label: proofs.label })
      .from(proofs)
      .where(and(eq(proofs.profileId, r.profileId), sql`${proofs.lastVerifiedAt} is not null`));
    if (target.length === 0) return [];
    const held = await tx
      .select({ kind: proofs.kind, target: proofs.target })
      .from(proofs)
      .innerJoin(
        profiles,
        and(eq(profiles.tenantId, proofs.tenantId), eq(profiles.id, proofs.profileId)),
      )
      .where(
        and(
          eq(profiles.subjectId, r.requestedBySubjectId),
          eq(proofs.status, "verified"),
          sql`${proofs.expiresAt} > now()`,
        ),
      );
    const heldKeys = new Set(held.map((h) => `${h.kind}|${h.target}`));
    const seen = new Set<string>();
    return target
      .filter((x) => !seen.has(`${x.kind}|${x.target}`) && seen.add(`${x.kind}|${x.target}`))
      .map((x) => ({
        kind: x.kind,
        label: x.label,
        requesterHolds: heldKeys.has(`${x.kind}|${x.target}`),
      }));
  }

  async requestReview(
    p: Principal,
    t: TenantContext,
    profileId: string,
    input: ReviewRequest,
    correlationId: string,
  ): Promise<ReviewView> {
    try {
      return await this.scoped(p, t, async (tx) => {
        const { row: profile, canManage } = await this.loadProfile(tx, p, t, profileId);
        if (input.kind === "claim" && !canManage)
          throw forbidden("Only the profile's owner asks for claims to be reviewed.");
        if (input.kind === "claim" && profile.moderationState === "suspended")
          throw conflict("profile_suspended", "This profile is suspended.");
        if (input.kind === "ownership") {
          if (canManage) throw conflict("already_owner", "You already manage this profile.");
          if (profile.kind !== "creator")
            throw badRequest(
              "not_transferable",
              "The organization's profile belongs to its owners and admins; it has no single owner to change.",
            );
        }
        const requester = await this.mySubject(tx, p, t, profile.displayName);
        const id = newReviewId();
        await tx.insert(reviews).values({
          id,
          tenantId: t.tenantId,
          profileId,
          kind: input.kind,
          claimType: input.kind === "claim" ? input.claimType : null,
          ownershipReason: input.kind === "ownership" ? input.reason : null,
          statement: input.statement,
          evidence: input.evidence,
          evidenceHash: evidenceHash(input),
          visibility: input.kind === "claim" ? input.visibility : "tenant",
          requestedByUserId: p.userId,
          requestedBySubjectId: requester,
        });
        await recordAudit(tx, {
          tenantId: t.tenantId,
          actorUserId: p.userId,
          action: "identity.review_requested",
          targetType: "identity_review",
          targetId: id,
          metadata: { kind: input.kind, profileId },
          correlationId,
        });
        const [view] = await this.reviewViews(tx, p, t, eq(reviews.id, id));
        return view!;
      });
    } catch (error) {
      if (isUniqueViolation(error, "identity_reviews_open_ownership_uq"))
        throw conflict(
          "request_open",
          "You already have an open ownership request for this profile.",
        );
      throw error;
    }
  }

  async listReviews(
    p: Principal,
    t: TenantContext,
    status: "pending" | "decided",
  ): Promise<ReviewView[]> {
    return this.scoped(p, t, (tx) =>
      this.reviewViews(
        tx,
        p,
        t,
        and(
          eq(reviews.tenantId, t.tenantId),
          status === "pending"
            ? eq(reviews.status, "pending")
            : inArray(reviews.status, ["approved", "rejected", "withdrawn", "revoked"]),
        ),
      ),
    );
  }

  private async lockReview(tx: Tx, t: TenantContext, id: string) {
    const [row] = await tx
      .select()
      .from(reviews)
      .where(and(eq(reviews.id, id), eq(reviews.tenantId, t.tenantId)))
      .for("update");
    if (!row) throw notFound("No such request.");
    return row;
  }

  /**
   * A human decision. The decider must be an owner or admin and not the
   * requester. Approving a claim records an identity claim labeled
   * identity_reviewed; approving an ownership request moves the profile to the
   * requester and ends the previous owner's proofs and reviewed claims.
   */
  async decide(
    p: Principal,
    t: TenantContext,
    id: string,
    input: ReviewDecisionInput,
    correlationId: string,
  ): Promise<ReviewView> {
    if (!this.isAdmin(t)) throw forbidden("Only owners and admins decide requests.");
    return this.scoped(p, t, async (tx) => {
      const r = await this.lockReview(tx, t, id);
      if (r.status !== "pending")
        throw conflict("already_decided", "This request was already decided or withdrawn.");
      if (r.requestedByUserId === p.userId)
        throw forbidden("You cannot decide your own request. Another owner or admin must.");
      const decided = {
        decidedByUserId: p.userId,
        // The transaction's time: the profile owner change checks it matches.
        decidedAt: sql`now()` as unknown as Date,
        decisionReason: input.reason,
      };
      let metadata: Record<string, string> = {
        decision: input.decision,
        kind: r.kind,
        evidenceHash: r.evidenceHash,
      };
      if (input.decision === "reject") {
        await tx
          .update(reviews)
          .set({ status: "rejected", ...decided })
          .where(eq(reviews.id, id));
      } else if (r.kind === "claim") {
        const reviewer = await this.mySubject(tx, p, t, "Reviewer");
        const [profile] = await tx
          .select({ subjectId: profiles.subjectId })
          .from(profiles)
          .where(eq(profiles.id, r.profileId));
        const claimId = newId("identity_claim");
        await tx.insert(claims).values({
          id: claimId,
          tenantId: t.tenantId,
          createdBySubjectId: reviewer,
          visibility: r.visibility,
          sourceProvider: "originos_review",
          assertedBySubjectId: r.requestedBySubjectId,
          observedBySubjectId: reviewer,
          captureMethod: "manual",
          validationMechanism: "human_review",
          assurance: "identity_reviewed",
          limitations:
            "An owner or admin of the hosting organization reviewed the evidence submitted with this claim. OriginOS did not check the claim itself.",
          contentHash: r.evidenceHash,
          subjectId: profile!.subjectId,
          claimType: `reviewed_${r.claimType}`,
          value: r.statement,
        });
        await tx
          .update(reviews)
          .set({ status: "approved", ...decided, claimId })
          .where(eq(reviews.id, id));
        metadata = { ...metadata, claimId };
      } else {
        await this.approveOwnership(tx, p, r, decided, correlationId);
        metadata = { ...metadata, profileId: r.profileId };
      }
      await recordAudit(tx, {
        tenantId: t.tenantId,
        actorUserId: p.userId,
        action: "identity.review_decided",
        targetType: "identity_review",
        targetId: id,
        metadata,
        correlationId,
      });
      const [view] = await this.reviewViews(tx, p, t, eq(reviews.id, id));
      return view!;
    });
  }

  private async approveOwnership(
    tx: Tx,
    p: Principal,
    r: ReviewRow,
    decided: { decidedByUserId: string; decidedAt: Date; decisionReason: string },
    correlationId: string,
  ) {
    await tx
      .update(reviews)
      .set({ status: "approved", ...decided })
      .where(eq(reviews.id, r.id));
    const [before] = await tx
      .select({ subjectId: profiles.subjectId })
      .from(profiles)
      .where(eq(profiles.id, r.profileId));
    await tx
      .update(profiles)
      .set({ subjectId: r.requestedBySubjectId })
      .where(eq(profiles.id, r.profileId));
    // The previous owner's proofs showed *their* control; they no longer back this profile.
    const live = await tx
      .select()
      .from(proofs)
      .where(and(eq(proofs.profileId, r.profileId), ne(proofs.status, "revoked")));
    await this.revokeProofRows(tx, p, live, "ownership_changed");
    const approvedClaims = await tx
      .select()
      .from(reviews)
      .where(
        and(
          eq(reviews.profileId, r.profileId),
          eq(reviews.kind, "claim"),
          eq(reviews.status, "approved"),
        ),
      );
    for (const c of approvedClaims) {
      await tx
        .update(reviews)
        .set({
          status: "revoked",
          revokedAt: new Date(),
          revokedReason: "Ended when the profile changed owner.",
          revokedByUserId: p.userId,
        })
        .where(eq(reviews.id, c.id));
      if (c.claimId)
        await tx.update(claims).set({ revokedAt: new Date() }).where(eq(claims.id, c.claimId));
    }
    // Close other open ownership requests for the same profile.
    await tx
      .update(reviews)
      .set({
        status: "rejected",
        decidedByUserId: p.userId,
        decidedAt: sql`now()` as unknown as Date,
        decisionReason: "Another ownership request for this profile was approved.",
      })
      .where(
        and(
          eq(reviews.profileId, r.profileId),
          eq(reviews.kind, "ownership"),
          eq(reviews.status, "pending"),
          ne(reviews.id, r.id),
          or(sql`${reviews.requestedByUserId} is null`, ne(reviews.requestedByUserId, p.userId)),
        ),
      );
    await recordAudit(tx, {
      tenantId: r.tenantId,
      actorUserId: p.userId,
      action: "identity.ownership_changed",
      targetType: "profile",
      targetId: r.profileId,
      metadata: {
        reviewId: r.id,
        fromSubjectId: before?.subjectId ?? null,
        toSubjectId: r.requestedBySubjectId,
        proofsRevoked: live.length,
        claimsRevoked: approvedClaims.length,
      },
      correlationId,
    });
  }

  async withdraw(
    p: Principal,
    t: TenantContext,
    id: string,
    correlationId: string,
  ): Promise<ReviewView> {
    return this.scoped(p, t, async (tx) => {
      const r = await this.lockReview(tx, t, id);
      if (r.requestedByUserId !== p.userId)
        throw forbidden("Only the person who asked can withdraw a request.");
      if (r.status !== "pending")
        throw conflict("already_decided", "This request was already decided or withdrawn.");
      await tx.update(reviews).set({ status: "withdrawn" }).where(eq(reviews.id, id));
      await recordAudit(tx, {
        tenantId: t.tenantId,
        actorUserId: p.userId,
        action: "identity.review_withdrawn",
        targetType: "identity_review",
        targetId: id,
        correlationId,
      });
      const [view] = await this.reviewViews(tx, p, t, eq(reviews.id, id));
      return view!;
    });
  }

  /** Revoke an approved claim (new evidence, a mistake). The decision stays as recorded. */
  async revokeReview(
    p: Principal,
    t: TenantContext,
    id: string,
    reason: string,
    correlationId: string,
  ): Promise<ReviewView> {
    if (!this.isAdmin(t)) throw forbidden("Only owners and admins revoke reviewed claims.");
    return this.scoped(p, t, async (tx) => {
      const r = await this.lockReview(tx, t, id);
      if (r.kind !== "claim" || r.status !== "approved")
        throw conflict("not_revocable", "Only approved claims can be revoked.");
      const now = new Date();
      await tx
        .update(reviews)
        .set({
          status: "revoked",
          revokedAt: now,
          revokedReason: reason,
          revokedByUserId: p.userId,
        })
        .where(eq(reviews.id, id));
      if (r.claimId)
        await tx.update(claims).set({ revokedAt: now }).where(eq(claims.id, r.claimId));
      await recordAudit(tx, {
        tenantId: t.tenantId,
        actorUserId: p.userId,
        action: "identity.review_revoked",
        targetType: "identity_review",
        targetId: id,
        metadata: { claimId: r.claimId },
        correlationId,
      });
      const [view] = await this.reviewViews(tx, p, t, eq(reviews.id, id));
      return view!;
    });
  }

  // --- Public -----------------------------------------------------------------

  /** A public, active profile, or 404. No session, no tenant: SECURITY DEFINER reads only. */
  async publicProfile(handle: string): Promise<PublicProfileView> {
    const db = this.database;
    const found = await db.execute<{
      id: string;
      kind: "creator" | "organization";
      handle: string;
      display_name: string;
      bio: string | null;
      pseudonymous: boolean;
      discoverable: boolean;
      updated_at: Date | string;
    }>(sql`select * from trust.public_profile(${handle})`);
    const profile = found.rows[0];
    if (!profile) throw notFound("No public profile has that handle.");
    const date = (v: Date | string | null) => (v === null ? null : new Date(v));
    const proofRows = await db.execute<{
      id: string;
      kind: "domain" | "account";
      method: "dns_txt" | "html_file" | "oauth";
      label: string;
      provider: string | null;
      status: "pending" | "verified" | "stale" | "revoked";
      last_verified_at: string | Date | null;
      expires_at: string | Date | null;
      stale_reason: string | null;
      revoked_at: string | Date | null;
      revoked_reason: "withdrawn" | "ownership_changed" | "reviewer" | null;
    }>(sql`select * from trust.public_profile_proofs(${profile.id})`);
    const reviewRows = await db.execute<{
      id: string;
      claim_type: "affiliation" | "former_name" | "other" | null;
      statement: string;
      status: string;
      decided_at: string | Date | null;
      revoked_at: string | Date | null;
    }>(sql`select * from trust.public_profile_reviews(${profile.id})`);
    const badges: BadgeView[] = badgesFor({
      proofs: proofRows.rows.map((x) => ({
        id: x.id,
        kind: x.kind,
        method: x.method,
        label: x.label,
        provider: x.provider,
        status: x.status,
        lastVerifiedAt: date(x.last_verified_at),
        expiresAt: date(x.expires_at),
        staleReason: x.stale_reason,
        revokedAt: date(x.revoked_at),
        revokedReason: x.revoked_reason,
      })),
      reviews: reviewRows.rows.map((x) => ({
        id: x.id,
        claimType: x.claim_type,
        statement: x.statement,
        status: x.status,
        decidedAt: date(x.decided_at),
        revokedAt: date(x.revoked_at),
        reviewerLabel: PUBLIC_REVIEWER,
      })),
      providerNames: this.providerNames(),
    });
    return {
      handle: profile.handle,
      kind: profile.kind,
      displayName: profile.display_name,
      bio: profile.bio,
      pseudonymous: profile.pseudonymous,
      discoverable: profile.discoverable,
      badges,
      updatedAt: new Date(profile.updated_at).toISOString(),
    };
  }
}
