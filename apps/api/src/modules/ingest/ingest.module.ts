import { type DynamicModule, Module } from "@nestjs/common";
import type { Db } from "@originos/db";
import type { Storage } from "@originos/storage";
import { APP_DB } from "../core/index.js";
import { FilesController, JobsController } from "./ingest.controller.js";
import { JobsService } from "./jobs.service.js";
import { STORAGE } from "./tokens.js";
import { UploadsService } from "./uploads.service.js";

/** Ingestion (uploads into quarantine, scanning by the worker) and the job admin API (ADR-026). */
@Module({})
export class IngestModule {
  static register(options: { readonly storage: Storage; readonly db: Db | null }): DynamicModule {
    return {
      module: IngestModule,
      controllers: [FilesController, JobsController],
      providers: [
        { provide: STORAGE, useValue: options.storage },
        { provide: APP_DB, useValue: options.db },
        UploadsService,
        JobsService,
      ],
    };
  }
}
