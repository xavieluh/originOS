import { SetMetadata, createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Role } from "@originos/db";
import type { FastifyRequest } from "fastify";
import type { Principal, TenantContext } from "./principal.js";

export const PUBLIC_KEY = "originos:public";
export const TENANT_ROLES_KEY = "originos:tenant-roles";

/** Opt a route out of authentication. Everything else requires a session (deny by default). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Require an active organization the caller belongs to, optionally with one of `roles`.
 * With no roles, any member passes.
 */
export const RequireTenant = (...roles: Role[]) => SetMetadata(TENANT_ROLES_KEY, roles);

export const CurrentPrincipal = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Principal => {
    const principal = ctx.switchToHttp().getRequest<FastifyRequest>().principal;
    if (!principal) throw new Error("CurrentPrincipal used on a route without authentication");
    return principal;
  },
);

export const CurrentTenant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TenantContext => {
    const tenant = ctx.switchToHttp().getRequest<FastifyRequest>().tenant;
    if (!tenant) throw new Error("CurrentTenant used on a route without @RequireTenant()");
    return tenant;
  },
);

export const CorrelationId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => ctx.switchToHttp().getRequest<FastifyRequest>().id,
);
