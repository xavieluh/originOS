import { NO_CONNECT } from "@originos/connect";
import { HealthResponse } from "@originos/contracts";
import type { Database } from "@originos/db";
import { describe, expect, it } from "vitest";
import { loadWorkerEnv } from "../src/env.js";
import { jobHandlers } from "../src/handlers.js";
import { createJobRunner } from "../src/job-runner.js";
import { createOutboxDispatcher } from "../src/outbox-dispatcher.js";
import { createWorker } from "../src/worker.js";

describe("worker", () => {
  it("registers the upload scan and connect jobs, no outbox consumers yet, and has no runners without a database", () => {
    expect(
      jobHandlers({ store: null, scanner: null, maxUploadBytes: 1 }, NO_CONNECT).map((h) => h.type),
    ).toEqual(["ingest.scan_upload", "connect.check", "connect.revoke"]);
    const worker = createWorker({ LOG_LEVEL: "silent" }, null);
    expect(worker.jobs).toBeNull();
    expect(worker.outbox).toBeNull();
    return worker.stop();
  });

  it("refuses two handlers for the same job type", () => {
    const h = { type: "test.job", run: async () => undefined };
    expect(() => createJobRunner({ db: {} as never, workerId: "w", handlers: [h, h] })).toThrow(
      /Duplicate/,
    );
  });

  it("refuses two outbox consumers with the same name (the name is the idempotency key)", () => {
    const consumer = {
      name: "search",
      eventTypes: ["work.created"],
      handle: async () => undefined,
    };
    expect(() =>
      createOutboxDispatcher({ db: {} as never, workerId: "w", consumers: [consumer, consumer] }),
    ).toThrow(/Duplicate outbox consumer/);
  });

  it("does not poll the outbox when no consumers are registered", async () => {
    let claims = 0;
    const db = { execute: async () => ((claims += 1), { rows: [] }) } as never;
    const dispatcher = createOutboxDispatcher({ db, workerId: "w", consumers: [] });
    dispatcher.start(10);
    await new Promise((r) => setTimeout(r, 50));
    await dispatcher.stop();
    expect(claims).toBe(0);
  });

  it("reports the database honestly on readiness", async () => {
    const worker = createWorker({ LOG_LEVEL: "silent" }, null);
    const res = await worker.health.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    const checks = HealthResponse.parse(res.json()).checks;
    expect(checks.database?.status).toBe("not_configured");
    expect(checks.objectStorage?.status).toBe("not_configured");
    expect(checks.malwareScanner?.status).toBe("not_configured");
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

  it("bounds the outbox poll interval", () => {
    expect(loadWorkerEnv({}).OUTBOX_POLL_MS).toBe(1_000);
    expect(() => loadWorkerEnv({ OUTBOX_POLL_MS: "5" })).toThrow(/OUTBOX_POLL_MS/);
  });

  it("requires DATABASE_URL in production", () => {
    expect(() => loadWorkerEnv({ NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
  });
});
