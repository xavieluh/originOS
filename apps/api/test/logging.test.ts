import { afterEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApi } from "../src/app.js";

let app: NestFastifyApplication | undefined;
afterEach(async () => {
  await app?.close();
});

describe("API structured logging", () => {
  it("logs JSON lines tagged with the request's correlation ID and no credentials", async () => {
    const lines: string[] = [];
    app = await createApi({
      database: null,
      logLevel: "info",
      logDestination: { write: (line) => void lines.push(line) },
    });
    await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: "GET",
        url: "/health/live",
        headers: {
          "x-correlation-id": "trace-me-12345",
          authorization: "Bearer top-secret-token",
          cookie: "session=abc",
        },
      });
    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.every((e) => e.correlationId === "trace-me-12345")).toBe(true);
    const output = lines.join("");
    expect(output).not.toContain("top-secret-token");
    expect(output).not.toContain("session=abc");
  });
});
