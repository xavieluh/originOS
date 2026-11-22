import { Inject, Injectable } from "@nestjs/common";
import { type DependencyCheck, type HealthResponse, summarizeChecks } from "@originos/contracts";
import { databaseHealthCheck } from "@originos/db";
import { API_VERSION } from "../../version.js";
import { DATABASE, type OptionalDatabase } from "./health.tokens.js";

@Injectable()
export class HealthService {
  constructor(@Inject(DATABASE) private readonly database: OptionalDatabase) {}

  live(now: Date = new Date()): HealthResponse {
    return this.response({}, now);
  }

  async ready(now: Date = new Date()): Promise<HealthResponse> {
    return this.response({ database: await databaseHealthCheck(this.database) }, now);
  }

  private response(checks: Record<string, DependencyCheck>, now: Date): HealthResponse {
    return {
      service: "api",
      status: summarizeChecks(checks),
      version: API_VERSION,
      checkedAt: now.toISOString(),
      checks,
    };
  }
}
