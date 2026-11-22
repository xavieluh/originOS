import { Writable } from "node:stream";
import { HealthResponse } from "@originos/contracts";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpService, loggerOptions } from "../src/index.js";

const fixedNow = () => new Date("2026-11-22T00:00:00.000Z");
const apps: { close(): Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

function build(readinessChecks?: Parameters<typeof createHttpService>[0]["readinessChecks"]) {
  const app = createHttpService({
    service: "telemetry",
    version: "1.2.3",
    logLevel: "silent",
    now: fixedNow,
    ...(readinessChecks ? { readinessChecks } : {}),
  });
  apps.push(app);
  return app;
}

describe("createHttpService", () => {
  it("serves a contract-valid liveness response", async () => {
    const res = await build().inject({ method: "GET", url: "/health/live" });
    expect(res.statusCode).toBe(200);
    const body = HealthResponse.parse(res.json());
    expect(body).toMatchObject({
      service: "telemetry",
      status: "ok",
      version: "1.2.3",
      checks: {},
    });
  });

  it("returns 503 from readiness when a dependency fails, including a throwing check", async () => {
    const app = build({
      store: async () => ({ status: "ok" }),
      broken: async () => {
        throw new Error("secret detail that must not leak");
      },
    });
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      status: "down",
      checks: { store: { status: "ok" }, broken: { status: "error", detail: "check failed" } },
    });
    expect(res.body).not.toContain("secret detail");
  });

  it("echoes a valid correlation ID and replaces an unsafe one", async () => {
    const app = build();
    const kept = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { "x-correlation-id": "corr-12345678" },
    });
    expect(kept.headers["x-correlation-id"]).toBe("corr-12345678");
    const replaced = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { "x-correlation-id": "bad" },
    });
    expect(replaced.headers["x-correlation-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("answers unknown routes with a JSON 404", async () => {
    const res = await build().inject({ method: "POST", url: "/v1/ingest" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
  });
});

describe("loggerOptions", () => {
  it("redacts credential headers in log lines", async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const app = Fastify({ logger: { ...loggerOptions("info"), stream } });
    apps.push(app);
    app.get("/", async (request) => {
      request.log.info({ headers: request.headers }, "headers probe");
      request.log.info(
        { token: "top-secret-token", user: { password: "hunter2" } },
        "fields probe",
      );
      return {};
    });
    await app.inject({
      method: "GET",
      url: "/",
      headers: { authorization: "Bearer top-secret-token", cookie: "session=abc" },
    });
    const output = lines.join("");
    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("top-secret-token");
    expect(output).not.toContain("session=abc");
    expect(output).not.toContain("hunter2");
  });
});
