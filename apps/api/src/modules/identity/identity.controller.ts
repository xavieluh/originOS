import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import {
  AccountProofCallback,
  DomainProofStart,
  Handle,
  ModerationInput,
  ProfileCreate,
  ProfileId,
  ProfileUpdate,
  ProofId,
  ProofVisibilityUpdate,
  ProviderId,
  ReviewDecisionInput,
  ReviewId,
  ReviewRequest,
  ReviewRevokeInput,
} from "@originos/contracts";
import { z } from "zod";
import {
  CorrelationId,
  CurrentPrincipal,
  CurrentTenant,
  type Principal,
  Public,
  RequirePermission,
  type TenantContext,
  notFound,
  parse,
} from "../core/index.js";
import { IdentityService } from "./identity.service.js";

/** Profiles in this organization, their proofs and their review requests. */
@Controller("v1/profiles")
export class ProfilesController {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}

  @Get()
  @RequirePermission("read", "identity")
  list(@CurrentPrincipal() p: Principal, @CurrentTenant() t: TenantContext) {
    return this.identity.list(p, t);
  }

  @Post()
  @RequirePermission("write", "identity")
  create(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Body() body: unknown,
    @CorrelationId() c: string,
  ) {
    return this.identity.create(p, t, parse(ProfileCreate.strict(), body), c);
  }

  @Get(":id")
  @RequirePermission("read", "identity")
  detail(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
  ) {
    return this.identity.detail(p, t, parse(ProfileId, id));
  }

  @Patch(":id")
  @RequirePermission("write", "identity")
  update(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @Body() body: unknown,
    @CorrelationId() c: string,
  ) {
    return this.identity.update(p, t, parse(ProfileId, id), parse(ProfileUpdate.strict(), body), c);
  }

  @Post(":id/moderation")
  @HttpCode(200)
  @RequirePermission("admin", "identity")
  moderate(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @Body() body: unknown,
    @CorrelationId() c: string,
  ) {
    return this.identity.moderate(
      p,
      t,
      parse(ProfileId, id),
      parse(ModerationInput.strict(), body),
      c,
    );
  }

  @Post(":id/proofs/domain")
  @RequirePermission("write", "identity")
  startDomain(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @Body() body: unknown,
    @CorrelationId() c: string,
  ) {
    return this.identity.startDomainProof(
      p,
      t,
      parse(ProfileId, id),
      parse(DomainProofStart.strict(), body),
      c,
    );
  }

  @Post(":id/proofs/account/:provider/start")
  @HttpCode(200)
  @RequirePermission("write", "identity")
  startAccount(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @Param("provider") provider: string,
    @CorrelationId() c: string,
  ) {
    return this.identity.startAccountProof(
      p,
      t,
      parse(ProfileId, id),
      parse(ProviderId, provider),
      c,
    );
  }

  @Post(":id/proofs/:proofId/check")
  @HttpCode(202)
  @RequirePermission("write", "identity")
  check(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @Param("proofId") proofId: string,
    @CorrelationId() c: string,
  ) {
    return this.identity.checkProof(p, t, parse(ProfileId, id), parse(ProofId, proofId), c);
  }

  @Patch(":id/proofs/:proofId")
  @RequirePermission("write", "identity")
  visibility(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @Param("proofId") proofId: string,
    @Body() body: unknown,
    @CorrelationId() c: string,
  ) {
    const { visibility } = parse(ProofVisibilityUpdate.strict(), body);
    return this.identity.setProofVisibility(
      p,
      t,
      parse(ProfileId, id),
      parse(ProofId, proofId),
      visibility,
      c,
    );
  }

  @Post(":id/proofs/:proofId/revoke")
  @HttpCode(200)
  @RequirePermission("write", "identity")
  revoke(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @Param("proofId") proofId: string,
    @CorrelationId() c: string,
  ) {
    return this.identity.revokeProof(p, t, parse(ProfileId, id), parse(ProofId, proofId), c);
  }

  @Post(":id/reviews")
  @RequirePermission("write", "identity")
  requestReview(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @Body() body: unknown,
    @CorrelationId() c: string,
  ) {
    return this.identity.requestReview(p, t, parse(ProfileId, id), parse(ReviewRequest, body), c);
  }
}

/** Account proof providers and the OAuth callback for account proofs. */
@Controller("v1/identity")
export class IdentityController {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}

  @Get("providers")
  @RequirePermission("read", "identity")
  providers() {
    return this.identity.accountProviders();
  }

  @Post("callback")
  @HttpCode(200)
  @RequirePermission("write", "identity")
  callback(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Body() body: unknown,
    @CorrelationId() c: string,
  ) {
    return this.identity.accountCallback(p, t, parse(AccountProofCallback.strict(), body), c);
  }

  @Get("reviews")
  @RequirePermission("read", "identity")
  reviews(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Query("status") status: string | undefined,
  ) {
    return this.identity.listReviews(
      p,
      t,
      parse(z.enum(["pending", "decided"]).default("pending"), status),
    );
  }

  @Post("reviews/:id/decision")
  @HttpCode(200)
  @RequirePermission("admin", "identity")
  decide(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @Body() body: unknown,
    @CorrelationId() c: string,
  ) {
    return this.identity.decide(
      p,
      t,
      parse(ReviewId, id),
      parse(ReviewDecisionInput.strict(), body),
      c,
    );
  }

  @Post("reviews/:id/withdraw")
  @HttpCode(200)
  @RequirePermission("write", "identity")
  withdraw(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @CorrelationId() c: string,
  ) {
    return this.identity.withdraw(p, t, parse(ReviewId, id), c);
  }

  @Post("reviews/:id/revoke")
  @HttpCode(200)
  @RequirePermission("admin", "identity")
  revokeReview(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @Body() body: unknown,
    @CorrelationId() c: string,
  ) {
    const { reason } = parse(ReviewRevokeInput.strict(), body);
    return this.identity.revokeReview(p, t, parse(ReviewId, id), reason, c);
  }
}

/** Public profile pages read this. No session; only public, active profiles. */
@Controller("v1/public/profiles")
export class PublicProfilesController {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}

  @Get(":handle")
  @Public()
  profile(@Param("handle") handle: string) {
    const parsed = Handle.safeParse(handle);
    if (!parsed.success) throw notFound("No public profile has that handle.");
    return this.identity.publicProfile(parsed.data);
  }
}
