import { type DynamicModule, Module } from "@nestjs/common";
import type { Connect } from "@originos/connect";
import type { Db } from "@originos/db";
import { APP_DB } from "../core/index.js";
import {
  ConnectController,
  ConnectionsController,
  WebhooksController,
} from "./connect.controller.js";
import { ConnectService } from "./connect.service.js";
import { CONNECT, CONNECT_PUBLIC_ORIGIN, WEBHOOK_BASE_URL } from "./tokens.js";

export interface ConnectModuleOptions {
  readonly connect: Connect;
  readonly db: Db | null;
  readonly publicOrigin: string;
  readonly webhookBaseUrl: string | null;
}

/** Origin Connect (Phase 08, ADR-027): provider registry, OAuth broker and inbound webhooks. */
@Module({})
export class ConnectModule {
  static register(options: ConnectModuleOptions): DynamicModule {
    return {
      module: ConnectModule,
      controllers: [ConnectController, ConnectionsController, WebhooksController],
      providers: [
        { provide: CONNECT, useValue: options.connect },
        { provide: APP_DB, useValue: options.db },
        { provide: CONNECT_PUBLIC_ORIGIN, useValue: options.publicOrigin },
        { provide: WEBHOOK_BASE_URL, useValue: options.webhookBaseUrl },
        ConnectService,
      ],
    };
  }
}
