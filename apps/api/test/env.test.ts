import { describe, expect, it } from "vitest";
import { loadApiEnv } from "../src/config/env.js";

describe("loadApiEnv", () => {
  it("defaults to loopback and port 4000 with no database", () => {
    expect(loadApiEnv({})).toMatchObject({
      API_HOST: "127.0.0.1",
      API_PORT: 4000,
      NODE_ENV: "development",
    });
    expect(loadApiEnv({}).DATABASE_URL).toBeUndefined();
  });

  it("requires DATABASE_URL in production", () => {
    expect(() => loadApiEnv({ NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
  });

  it("rejects a malformed DATABASE_URL without echoing it", () => {
    expect(() => loadApiEnv({ DATABASE_URL: "hunter2-not-a-url" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("hunter2") }),
    );
  });

  it("requires an auth secret, https public URL and rate limits in production", () => {
    const base = {
      NODE_ENV: "production",
      DATABASE_URL: "postgres://u:p@db.internal:5432/originos",
      BETTER_AUTH_SECRET: "x".repeat(32),
      ORIGINOS_PUBLIC_URL: "https://app.example.com",
    };
    expect(loadApiEnv(base).AUTH_RATE_LIMIT).toBe("on");
    expect(() => loadApiEnv({ ...base, BETTER_AUTH_SECRET: undefined })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
    expect(() => loadApiEnv({ ...base, ORIGINOS_PUBLIC_URL: "http://app.example.com" })).toThrow(
      /ORIGINOS_PUBLIC_URL/,
    );
    expect(() => loadApiEnv({ ...base, AUTH_RATE_LIMIT: "off" })).toThrow(/AUTH_RATE_LIMIT/);
  });
});
