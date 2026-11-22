import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { HealthResponse } from "@originos/contracts";
import type { Database } from "@originos/db";
import { afterEach, describe, expect, it } from "vitest";
import { createApi } from "../src/app.js";

let app: NestFastifyApplication | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

function fakeDatabase(query: () => Promise<unknown>): Database {
  return { pool: { query }, db: {}, close: async () => undefined } as unknown as Database;
}

async function get(url: string, database: Database | null = null) {
  app = await createApi({ database, logLevel: "silent" });
  return app.getHttpAdapter().getInstance().inject({ method: "GET", url });
}

describe("GET /health/live", () => {
  it("returns a contract-valid ok response without checking dependencies", async () => {
    let queried = false;
    const res = await get(
      "/health/live",
      fakeDatabase(async () => {
        queried = true;
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(HealthResponse.parse(res.json())).toMatchObject({ service: "api", status: "ok" });
    expect(queried).toBe(false);
  });

  it("sets a correlation ID header", async () => {
    const res = await get("/health/live");
    expect(res.headers["x-correlation-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("GET /health/ready", () => {
  it("reports the database as not configured, honestly, when DATABASE_URL is unset", async () => {
    const res = await get("/health/ready");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: "ok",
      checks: { database: { status: "not_configured" } },
    });
  });

  it("reports ok when the database answers", async () => {
    const res = await get(
      "/health/ready",
      fakeDatabase(async () => ({ rows: [] })),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ checks: { database: { status: "ok" } } });
  });

  it("returns 503 when the configured database is unreachable", async () => {
    const res = await get(
      "/health/ready",
      fakeDatabase(async () => {
        throw Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:5432"), {
          code: "ECONNREFUSED",
        });
      }),
    );
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      status: "down",
      checks: { database: { status: "unreachable" } },
    });
    expect(res.body).not.toContain("10.0.0.5");
  });
});

describe("unknown routes", () => {
  it("404s", async () => {
    const res = await get("/v1/anything");
    expect(res.statusCode).toBe(404);
  });
});
