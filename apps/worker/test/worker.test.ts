import { HealthResponse } from "@originos/contracts";
import type { Database } from "@originos/db";
import { describe, expect, it } from "vitest";
import { loadWorkerEnv } from "../src/env.js";
import { createWorker } from "../src/worker.js";

describe("worker", () => {
  it("registers no job handlers in Phase 01", () => {
    const worker = createWorker({ LOG_LEVEL: "silent" }, null);
    expect(worker.handlers).toHaveLength(0);
    return worker.stop();
  });

  it("reports the database honestly on readiness", async () => {
    const worker = createWorker({ LOG_LEVEL: "silent" }, null);
    const res = await worker.health.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(HealthResponse.parse(res.json()).checks.database?.status).toBe("not_configured");
    await worker.stop();
  });

  it("is not ready when the configured database is unreachable, and closes it on stop", async () => {
    let closed = false;
    const database = {
      pool: {
        query: async () => {
          throw Object.assign(new Error("refused"), { code: "ECONNREFUSED" });
        },
      },
      close: async () => {
        closed = true;
      },
    } as unknown as Database;
    const worker = createWorker({ LOG_LEVEL: "silent" }, database);
    const res = await worker.health.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    await worker.stop();
    expect(closed).toBe(true);
  });

  it("requires DATABASE_URL in production", () => {
    expect(() => loadWorkerEnv({ NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
  });
});
