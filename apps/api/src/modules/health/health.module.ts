import { type DynamicModule, Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";
import { DATABASE, type OptionalDatabase } from "./health.tokens.js";

@Module({})
export class HealthModule {
  static register(database: OptionalDatabase): DynamicModule {
    return {
      module: HealthModule,
      controllers: [HealthController],
      providers: [{ provide: DATABASE, useValue: database }, HealthService],
    };
  }
}
