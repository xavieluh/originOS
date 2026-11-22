import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import type { HumanActor } from "@originos/authz";
import {
  CorrelationId,
  CurrentActor,
  CurrentPrincipal,
  CurrentTenant,
  RequirePermission,
  RequireTenant,
} from "../auth/decorators.js";
import type { Principal, TenantContext } from "../auth/principal.js";
import { UuidParam, parse } from "../tenancy/validation.js";
import { AccessService } from "./access.service.js";
import { ConsentService } from "./consent.service.js";
import { CreateAgentBody, CreateGrantBody, GiveConsentBody } from "./validation.js";

/** The signed-in person's own permissions and consents in the active organization. */
@Controller("v1/me")
export class MyAccessController {
  constructor(
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(ConsentService) private readonly consent: ConsentService,
  ) {}

  @Get("permissions")
  @RequireTenant()
  permissions(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @CurrentActor() actor: HumanActor,
  ) {
    return this.access.myPermissions(p, t, actor);
  }

  @Get("consents")
  @RequireTenant()
  consents(@CurrentPrincipal() p: Principal, @CurrentTenant() t: TenantContext) {
    return this.consent.list(p, t, "user");
  }

  @Post("consents")
  @RequireTenant()
  give(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Body() body: unknown,
    @CorrelationId() c: string,
  ) {
    return this.consent.give(p, t, "user", parse(GiveConsentBody, body), c);
  }

  @Post("consents/:id/revoke")
  @RequireTenant()
  @HttpCode(204)
  async revoke(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @CorrelationId() c: string,
  ) {
    await this.consent.revoke(p, t, "user", parse(UuidParam, id), c);
  }
}

/** Agents, permission grants and organization consent policies. */
@Controller("v1/organization")
export class OrganizationAccessController {
  constructor(
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(ConsentService) private readonly consent: ConsentService,
  ) {}

  @Get("agents")
  @RequirePermission("read", "agents")
  agents(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @CurrentActor() actor: HumanActor,
  ) {
    return this.access.listAgents(p, t, actor);
  }

  /** Any member may register an agent they own; ownership is checked in the service. */
  @Post("agents")
  @RequireTenant()
  createAgent(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @CurrentActor() actor: HumanActor,
    @Body() body: unknown,
    @CorrelationId() c: string,
  ) {
    return this.access.createAgent(p, t, actor, parse(CreateAgentBody, body), c);
  }

  @Post("agents/:id/disable")
  @RequireTenant()
  @HttpCode(204)
  async disableAgent(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @CurrentActor() actor: HumanActor,
    @Param("id") id: string,
    @CorrelationId() c: string,
  ) {
    await this.access.disableAgent(p, t, actor, parse(UuidParam, id), c);
  }

  @Get("agents/:id/permissions")
  @RequireTenant()
  agentPermissions(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @CurrentActor() actor: HumanActor,
    @Param("id") id: string,
  ) {
    return this.access.agentPermissions(p, t, actor, parse(UuidParam, id));
  }

  @Get("grants")
  @RequirePermission("read", "grants")
  grants(@CurrentPrincipal() p: Principal, @CurrentTenant() t: TenantContext) {
    return this.access.listGrants(p, t);
  }

  @Post("grants")
  @RequirePermission("admin", "grants")
  createGrant(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @CurrentActor() actor: HumanActor,
    @Body() body: unknown,
    @CorrelationId() c: string,
  ) {
    return this.access.createGrant(p, t, actor, parse(CreateGrantBody, body), c);
  }

  @Post("grants/:id/revoke")
  @RequirePermission("admin", "grants")
  @HttpCode(204)
  async revokeGrant(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @CurrentActor() actor: HumanActor,
    @Param("id") id: string,
    @CorrelationId() c: string,
  ) {
    await this.access.revokeGrant(p, t, actor, parse(UuidParam, id), c);
  }

  @Get("consents")
  @RequirePermission("read", "consents")
  consents(@CurrentPrincipal() p: Principal, @CurrentTenant() t: TenantContext) {
    return this.consent.list(p, t, "organization");
  }

  @Post("consents")
  @RequirePermission("write", "consents")
  give(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Body() body: unknown,
    @CorrelationId() c: string,
  ) {
    return this.consent.give(p, t, "organization", parse(GiveConsentBody, body), c);
  }

  @Post("consents/:id/revoke")
  @RequirePermission("write", "consents")
  @HttpCode(204)
  async revoke(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @CorrelationId() c: string,
  ) {
    await this.consent.revoke(p, t, "organization", parse(UuidParam, id), c);
  }
}
