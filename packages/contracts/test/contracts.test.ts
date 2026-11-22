import { describe, expect, it } from "vitest";
import {
  HealthResponse,
  isValidCorrelationId,
  resolveCorrelationId,
  summarizeChecks,
} from "../src/index.js";

describe("HealthResponse", () => {
  it("accepts a well-formed response", () => {
    const parsed = HealthResponse.parse({
      service: "api",
      status: "ok",
      version: "0.0.0",
      checkedAt: new Date().toISOString(),
      checks: { database: { status: "not_configured", detail: "DATABASE_URL is not set" } },
    });
    expect(parsed.service).toBe("api");
  });

  it("rejects unknown services and statuses", () => {
    const base = { version: "0", checkedAt: new Date().toISOString(), checks: {} };
    expect(HealthResponse.safeParse({ ...base, service: "other", status: "ok" }).success).toBe(
      false,
    );
    expect(HealthResponse.safeParse({ ...base, service: "api", status: "great" }).success).toBe(
      false,
    );
  });
});

describe("summarizeChecks", () => {
  it("is ok with no checks or only optional unconfigured ones", () => {
    expect(summarizeChecks({})).toBe("ok");
    expect(summarizeChecks({ database: { status: "not_configured" } })).toBe("ok");
  });

  it("is down when a configured dependency fails", () => {
    expect(summarizeChecks({ a: { status: "ok" }, database: { status: "unreachable" } })).toBe(
      "down",
    );
    expect(summarizeChecks({ database: { status: "error" } })).toBe("down");
  });
});

describe("correlation IDs", () => {
  it("keeps a valid incoming ID", () => {
    expect(resolveCorrelationId("abc12345-XYZ_9")).toBe("abc12345-XYZ_9");
    expect(resolveCorrelationId(["abc12345-first", "second-1234"])).toBe("abc12345-first");
  });

  it("replaces missing, short, oversized or unsafe IDs", () => {
    const generate = () => "generated-id";
    expect(resolveCorrelationId(undefined, generate)).toBe("generated-id");
    expect(resolveCorrelationId("short", generate)).toBe("generated-id");
    expect(resolveCorrelationId("a".repeat(129), generate)).toBe("generated-id");
    expect(resolveCorrelationId("bad id\nINJECTED log line", generate)).toBe("generated-id");
    expect(isValidCorrelationId(42)).toBe(false);
  });

  it("generates UUIDs by default", () => {
    expect(resolveCorrelationId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
