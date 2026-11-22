import { type DynamicModule, Module } from "@nestjs/common";
import type { Database } from "@originos/db";
import { type Auth, AuthModule, type Mailer } from "./modules/core/index.js";
import { HealthModule } from "./modules/health/index.js";

export interface AppModuleOptions {
  readonly database: Database | null;
  readonly auth: Auth | null;
  readonly mailer: Mailer;
  readonly publicOrigin: string;
}

/**
 * Root module. Each bounded context (ARCHITECTURE §5) is added here as its own
 * module under src/modules/<name>, reachable from others only via its index.ts.
 */
@Module({})
export class AppModule {
  static register(options: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        HealthModule.register(options.database),
        AuthModule.register({
          auth: options.auth,
          db: options.database?.db ?? null,
          mailer: options.mailer,
          publicOrigin: options.publicOrigin,
        }),
      ],
    };
  }
}
