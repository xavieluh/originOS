import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "../src/proxy";

describe("proxy (correlation IDs)", () => {
  it("keeps a valid incoming correlation ID and echoes it", () => {
    const req = new NextRequest("http://localhost/", {
      headers: { "x-correlation-id": "incoming-12345" },
    });
    const res = proxy(req);
    expect(res.headers.get("x-correlation-id")).toBe("incoming-12345");
    // Forwarded request headers are exposed by Next as x-middleware-request-*.
    expect(res.headers.get("x-middleware-request-x-correlation-id")).toBe("incoming-12345");
  });

  it("replaces an unsafe ID with a generated UUID", () => {
    const res = proxy(
      new NextRequest("http://localhost/", { headers: { "x-correlation-id": "x" } }),
    );
    expect(res.headers.get("x-correlation-id")).toMatch(/^[0-9a-f-]{36}$/);
  });
});
