import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  type RawBodyRequest,
  Req,
  Res,
} from "@nestjs/common";
import { ConnectCallback, ProviderId } from "@originos/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  CorrelationId,
  CurrentPrincipal,
  CurrentTenant,
  type Principal,
  Public,
  RequirePermission,
  type TenantContext,
  parse,
} from "../core/index.js";
import { ConnectService } from "./connect.service.js";

const ConnectionIdParam = z.string().regex(/^con_[0-9a-hjkmnp-tv-z]{26}$/);

/** The provider registry and the OAuth callback. */
@Controller("v1/connect")
export class ConnectController {
  constructor(@Inject(ConnectService) private readonly connect: ConnectService) {}

  @Get("providers")
  @RequirePermission("read", "integrations")
  providers() {
    return this.connect.providers();
  }

  /** The web app forwards the provider's redirect here; the code is exchanged server-side. */
  @Post("callback")
  @HttpCode(200)
  @RequirePermission("admin", "integrations")
  callback(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Body() body: unknown,
    @CorrelationId() c: string,
  ) {
    return this.connect.callback(p, t, parse(ConnectCallback.strict(), body), c);
  }
}

/** This organization's connections: connect, check, disconnect. Owners and admins change them. */
@Controller("v1/organization/connections")
export class ConnectionsController {
  constructor(@Inject(ConnectService) private readonly connect: ConnectService) {}

  @Get()
  @RequirePermission("read", "integrations")
  list(@CurrentPrincipal() p: Principal, @CurrentTenant() t: TenantContext) {
    return this.connect.list(p, t);
  }

  @Post(":provider/start")
  @HttpCode(200)
  @RequirePermission("admin", "integrations")
  start(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("provider") provider: string,
    @CorrelationId() c: string,
  ) {
    return this.connect.start(p, t, parse(ProviderId, provider), c);
  }

  @Post(":id/disconnect")
  @HttpCode(200)
  @RequirePermission("admin", "integrations")
  disconnect(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @CorrelationId() c: string,
  ) {
    return this.connect.disconnect(p, t, parse(ConnectionIdParam, id), c);
  }

  @Post(":id/check")
  @HttpCode(202)
  @RequirePermission("admin", "integrations")
  check(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
    @CorrelationId() c: string,
  ) {
    return this.connect.check(p, t, parse(ConnectionIdParam, id), c);
  }

  @Get(":id/deliveries")
  @RequirePermission("admin", "integrations")
  deliveries(
    @CurrentPrincipal() p: Principal,
    @CurrentTenant() t: TenantContext,
    @Param("id") id: string,
  ) {
    return this.connect.deliveries(p, t, parse(ConnectionIdParam, id));
  }
}

/**
 * Inbound webhooks. Public: providers have no session. The signature over the
 * raw body authenticates each delivery (see ConnectService.acceptWebhook).
 */
@Controller("v1/webhooks")
export class WebhooksController {
  constructor(@Inject(ConnectService) private readonly connect: ConnectService) {}

  @Post(":provider/:connectionId")
  @Public()
  async receive(
    @Param("provider") provider: string,
    @Param("connectionId") connectionId: string,
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Res() reply: FastifyReply,
    @CorrelationId() c: string,
  ) {
    const outcome = await this.connect.acceptWebhook(
      provider,
      connectionId,
      req.headers,
      req.rawBody,
      c,
    );
    await reply.status(outcome.status).send(outcome.body);
  }
}
