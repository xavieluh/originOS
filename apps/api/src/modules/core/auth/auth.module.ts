import { type DynamicModule, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import type { Db } from "@originos/db";
import { TenancyService } from "../tenancy/tenancy.service.js";
import {
  CurrentOrganizationController,
  InvitationsController,
  MeController,
  OrganizationsController,
} from "../tenancy/tenancy.controller.js";
import type { Mailer } from "../mail/mailer.js";
import type { Auth } from "./auth.js";
import { AuthConfigController } from "./auth-config.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { MyAccessController, OrganizationAccessController } from "../authz/authz.controller.js";
import { AccessService } from "../authz/access.service.js";
import { AuthzService } from "../authz/authz.service.js";
import { ConsentService } from "../authz/consent.service.js";
import { APP_DB, AUTH, MAILER, PUBLIC_ORIGIN } from "./tokens.js";

export interface AuthModuleOptions {
  readonly auth: Auth | null;
  readonly db: Db | null;
  readonly mailer: Mailer;
  readonly publicOrigin: string;
}

/**
 * Sessions, the global deny-by-default guard, tenancy (organizations, memberships,
 * invitations) and authorization (permissions, agents, grants, consent).
 */
@Module({})
export class AuthModule {
  static register(options: AuthModuleOptions): DynamicModule {
    return {
      module: AuthModule,
      controllers: [
        AuthConfigController,
        MeController,
        OrganizationsController,
        CurrentOrganizationController,
        InvitationsController,
        MyAccessController,
        OrganizationAccessController,
      ],
      providers: [
        { provide: AUTH, useValue: options.auth },
        { provide: APP_DB, useValue: options.db },
        { provide: MAILER, useValue: options.mailer },
        { provide: PUBLIC_ORIGIN, useValue: options.publicOrigin },
        TenancyService,
        AuthzService,
        AccessService,
        ConsentService,
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    };
  }
}
