import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import type { HumanActor } from "@originos/authz";
import {
  CorrelationId,
  CurrentActor,
  CurrentPrincipal,
  CurrentTenant,
  RequirePermission,
  RequireTenant,
} from "../auth/decorators.js";
import { AuthzService } from "../authz/authz.service.js";
import type { Principal, TenantContext } from "../auth/principal.js";
import { TenancyService } from "./tenancy.service.js";
import {
  ChangeRoleBody,
  CreateInvitationBody,
  CreateOrganizationBody,
  RenameOrganizationBody,
  SwitchOrganizationBody,
  TokenBody,
  TransferOwnershipBody,
  UuidParam,
  parse,
} from "./validation.js";

@Controller("v1/me")
export class MeController {
  constructor(@Inject(TenancyService) private readonly tenancy: TenancyService) {}

  /** The signed-in person, their organizations, and the active one (only if still a member). */
  @Get()
  async me(@CurrentPrincipal() principal: Principal) {
    const [memberships, tenant] = await Promise.all([
      this.tenancy.listMemberships(principal.userId),
      this.tenancy.resolveTenant(principal),
    ]);
    return {
      user: {
        id: principal.userId,
        name: principal.name,
        email: principal.email,
        emailVerified: principal.emailVerified,
        twoFactorEnabled: principal.twoFactorEnabled,
      },
      activeOrganizationId: tenant?.tenantId ?? null,
      memberships,
    };
  }

  @Put("active-organization")
  async switch(@CurrentPrincipal() principal: Principal, @Body() body: unknown) {
    const { organizationId } = parse(SwitchOrganizationBody, body);
    return this.tenancy.switchOrganization(principal, organizationId);
  }
}

@Controller("v1/organizations")
export class OrganizationsController {
  constructor(@Inject(TenancyService) private readonly tenancy: TenancyService) {}

  @Post()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
    @CorrelationId() correlationId: string,
  ) {
    const { name } = parse(CreateOrganizationBody, body);
    return this.tenancy.createOrganization(principal, name, correlationId);
  }
}

/**
 * The active organization. Every route needs a current membership; management
 * routes name the permission they need (decided by @originos/authz, ADR-024).
 */
@Controller("v1/organization")
export class CurrentOrganizationController {
  constructor(
    @Inject(TenancyService) private readonly tenancy: TenancyService,
    @Inject(AuthzService) private readonly authz: AuthzService,
  ) {}

  @Get()
  @RequireTenant()
  get(@CurrentPrincipal() p: Principal, @CurrentTenant() t: TenantContext) {
    return this.tenancy.getOrganization(p, t);
  }

  @Patch()
  @RequirePermission("write", "organization")
  @HttpCode(204)
  async rename(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Body() body: unknown,
    @CorrelationId() c: string,
  ) {
    await this.tenancy.renameOrganization(p, t, parse(RenameOrganizationBody, body).name, c);
  }

  @Get("invitations")
  @RequirePermission("read", "invitations")
  invitations(@CurrentPrincipal() p: Principal, @CurrentTenant() t: TenantContext) {
    return this.tenancy.listInvitations(p, t);
  }

  @Post("invitations")
  @RequirePermission("write", "invitations")
  invite(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Body() body: unknown,
    @CorrelationId() c: string,
  ) {
    const { email, role } = parse(CreateInvitationBody, body);
    return this.tenancy.createInvitation(p, t, email, role, c);
  }

  @Post("invitations/:id/revoke")
  @RequirePermission("write", "invitations")
  @HttpCode(204)
  async revoke(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @CorrelationId() c: string,
  ) {
    await this.tenancy.revokeInvitation(p, t, parse(UuidParam, id), c);
  }

  @Patch("members/:userId")
  @RequirePermission("admin", "members")
  @HttpCode(204)
  async changeRole(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("userId") userId: string,
    @Body() body: unknown,
    @CorrelationId() c: string,
  ) {
    await this.tenancy.changeRole(
      p,
      t,
      parse(UuidParam, userId),
      parse(ChangeRoleBody, body).role,
      c,
    );
  }

  /** Remove a member (owner or admin), or leave (any member removing themselves). */
  @Delete("members/:userId")
  @RequireTenant()
  @HttpCode(204)
  async remove(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @CurrentActor() actor: HumanActor,
    @Param("userId") userId: string,
    @CorrelationId() c: string,
  ) {
    const target = parse(UuidParam, userId);
    if (target !== p.userId) this.authz.require(actor, "admin", { type: "members" });
    await this.tenancy.removeMember(p, t, target, c);
  }

  @Post("transfer-ownership")
  @RequirePermission("admin", "organization")
  @HttpCode(204)
  async transfer(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Body() body: unknown,
    @CorrelationId() c: string,
  ) {
    await this.tenancy.transferOwnership(p, t, parse(TransferOwnershipBody, body).userId, c);
  }

  @Get("audit-events")
  @RequirePermission("read", "audit_log")
  audit(@CurrentPrincipal() p: Principal, @CurrentTenant() t: TenantContext) {
    return this.tenancy.listAuditEvents(p, t);
  }
}

/** Invitation tokens travel in POST bodies, never URLs, so they stay out of logs. */
@Controller("v1/invitations")
export class InvitationsController {
  constructor(@Inject(TenancyService) private readonly tenancy: TenancyService) {}

  @Post("lookup")
  @HttpCode(200)
  lookup(@CurrentPrincipal() p: Principal, @Body() body: unknown) {
    return this.tenancy.lookupInvitation(p, parse(TokenBody, body).token);
  }

  @Post("accept")
  @HttpCode(200)
  accept(@CurrentPrincipal() p: Principal, @Body() body: unknown, @CorrelationId() c: string) {
    return this.tenancy.acceptInvitation(p, parse(TokenBody, body).token, c);
  }
}
