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
});
