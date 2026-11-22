import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@originos/db";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyRequest } from "fastify";
import { AuthzService } from "../authz/authz.service.js";
import { TenancyService } from "../tenancy/tenancy.service.js";
import type { Auth } from "./auth.js";
import {
  BINARY_BODY_KEY,
  PERMISSION_KEY,
  PUBLIC_KEY,
  type RequiredPermission,
  TENANT_ROLES_KEY,
} from "./decorators.js";
import { ApiError, authNotConfigured, forbidden, unauthenticated } from "./errors.js";
import { AUTH, PUBLIC_ORIGIN } from "./tokens.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Global guard: every route needs a valid session unless marked @Public().
 * State-changing requests must also come from the web app's origin with a JSON
 * body (CSRF defense alongside SameSite=Lax cookies). Routes marked
 * @RequireTenant() additionally need a current membership in the session's
 * active organization, re-read from the database on every request; routes
 * marked @RequirePermission() are then decided by @originos/authz.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AUTH) private readonly auth: Auth | null,
    @Inject(PUBLIC_ORIGIN) private readonly publicOrigin: string,
    @Inject(TenancyService) private readonly tenancy: TenancyService,
    @Inject(AuthzService) private readonly authz: AuthzService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (!SAFE_METHODS.has(request.method)) {
      this.checkCsrf(
        request,
        this.reflector.getAllAndOverride<boolean>(BINARY_BODY_KEY, targets) === true,
      );
    }
    if (!this.auth) throw authNotConfigured();

    const result = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!result) throw unauthenticated();
    const { user, session } = result;
    request.principal = {
      userId: user.id,
      sessionId: session.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      twoFactorEnabled: Boolean((user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled),
      activeOrganizationId:
        (session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null,
    };

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(TENANT_ROLES_KEY, targets);
    const permission = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      PERMISSION_KEY,
      targets,
    );
    if (roles || permission) {
      const tenant = await this.tenancy.resolveTenant(request.principal);
      if (!tenant) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          "no_active_organization",
          "Choose or create an organization first.",
        );
      }
      if (roles && roles.length > 0 && !roles.includes(tenant.role)) throw forbidden();
      request.tenant = tenant;
      request.actor = await this.authz.humanActor(request.principal, tenant);
      if (permission) {
        this.authz.require(request.actor, permission.action, { type: permission.resourceType });
      }
    }
    return true;
  }

  private checkCsrf(request: FastifyRequest, binaryAllowed: boolean): void {
    if (request.headers.origin !== this.publicOrigin) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        "csrf_origin_mismatch",
        "Request origin is not allowed.",
      );
    }
    const type = (request.headers["content-type"] ?? "").toLowerCase();
    if (binaryAllowed && type === "application/octet-stream") return;
    if (request.body !== undefined && !type.startsWith("application/json")) {
      throw new ApiError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "json_required", "Send a JSON body.");
    }
  }
}
