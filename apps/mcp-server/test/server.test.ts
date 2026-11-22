import { HealthResponse } from "@originos/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../src/env.js";
import { buildServer } from "../src/server.js";

const app = buildServer({ LOG_LEVEL: "silent" });
afterAll(async () => app.close());

describe("mcp-server", () => {
  it("serves liveness and readiness", async () => {
    for (const url of ["/health/live", "/health/ready"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(200);
      expect(HealthResponse.parse(res.json())).toMatchObject({
        service: "mcp-server",
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

  it("binds to loopback on port 4100 by default", () => {
    expect(loadEnv({})).toMatchObject({ MCP_HOST: "127.0.0.1", MCP_PORT: 4100 });
  });

  it("rejects an invalid port", () => {
    expect(() => loadEnv({ MCP_PORT: "not-a-port" })).toThrow(/MCP_PORT/);
  });
});
