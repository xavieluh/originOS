import type { HumanActor } from "@originos/authz";
import type { Role } from "@originos/db";

/** The signed-in person behind a request, from a valid session cookie. */
export interface Principal {
  readonly userId: string;
  readonly sessionId: string;
  readonly name: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly twoFactorEnabled: boolean;
  readonly activeOrganizationId: string | null;
}

/** The organization a request acts in, after its membership was re-checked. */
export interface TenantContext {
  readonly tenantId: string;
  readonly role: Role;
}

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
    tenant?: TenantContext;
    actor?: HumanActor;
  }
}
