import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { HealthResponse } from "@originos/contracts";
import type { FastifyReply } from "fastify";
import { HealthService } from "./health.service.js";

@Controller("health")
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  /** Process is up. Never touches dependencies, so orchestrators can restart on failure only. */
  @Get("live")
  live(): HealthResponse {
    return this.health.live();
  }

  /** Dependencies usable. 503 when a configured dependency fails. */
  @Get("ready")
  async ready(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthResponse> {
    const body = await this.health.ready();
    reply.status(body.status === "ok" ? 200 : 503);
    return body;
  }
}
