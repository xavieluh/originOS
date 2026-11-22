import { describe, expect, it } from "vitest";
import { loadWebServerEnv } from "../src/lib/env";

describe("loadWebServerEnv", () => {
  it("defaults the API URL to loopback", () => {
    expect(loadWebServerEnv({}).ORIGINOS_API_URL).toBe("http://127.0.0.1:4000");
  });
  it("rejects a malformed API URL", () => {
    expect(() => loadWebServerEnv({ ORIGINOS_API_URL: "not a url" })).toThrow(/ORIGINOS_API_URL/);
  });
});
