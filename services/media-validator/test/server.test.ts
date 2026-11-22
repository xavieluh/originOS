import { HealthResponse } from "@originos/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../src/env.js";
import { buildServer } from "../src/server.js";

const app = buildServer({ LOG_LEVEL: "silent" });
afterAll(async () => app.close());

describe("media-validator", () => {
  it("serves liveness and readiness", async () => {
    for (const url of ["/health/live", "/health/ready"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(200);
      expect(HealthResponse.parse(res.json())).toMatchObject({
        service: "media-validator",
        status: "ok",
      });
    }
  });

  it("exposes no other routes yet (no claimed functionality)", async () => {
    for (const [method, url] of [
      ["GET", "/"],
      ["POST", "/v1/anything"],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(404);
    }
  });

  it("binds to loopback on port 4300 by default", () => {
    expect(loadEnv({})).toMatchObject({
      MEDIA_VALIDATOR_HOST: "127.0.0.1",
      MEDIA_VALIDATOR_PORT: 4300,
    });
  });

  it("rejects an invalid port", () => {
    expect(() => loadEnv({ MEDIA_VALIDATOR_PORT: "not-a-port" })).toThrow(/MEDIA_VALIDATOR_PORT/);
  });
});
