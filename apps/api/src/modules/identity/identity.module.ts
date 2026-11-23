import { type DynamicModule, Module } from "@nestjs/common";
import type { Connect } from "@originos/connect";
import type { Db } from "@originos/db";
import { APP_DB } from "../core/index.js";
import {
  IdentityController,
  ProfilesController,
  PublicProfilesController,
} from "./identity.controller.js";
import { IdentityService } from "./identity.service.js";
import { IDENTITY_CONNECT, IDENTITY_PUBLIC_ORIGIN } from "./tokens.js";

export interface IdentityModuleOptions {
  readonly connect: Connect;
  readonly db: Db | null;
  readonly publicOrigin: string;
}

/** IdentityMesh (Phase 09, ADR-028): profiles, ownership proofs, review queue, public profiles. */
@Module({})
export class IdentityModule {
  static register(options: IdentityModuleOptions): DynamicModule {
    return {
      module: IdentityModule,
      controllers: [ProfilesController, IdentityController, PublicProfilesController],
      providers: [
        { provide: IDENTITY_CONNECT, useValue: options.connect },
        { provide: APP_DB, useValue: options.db },
        { provide: IDENTITY_PUBLIC_ORIGIN, useValue: options.publicOrigin },
        IdentityService,
      ],
    };
  }
}
