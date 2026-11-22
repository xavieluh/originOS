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

describe("proxy (signed-out redirects)", () => {
  it("sends a request without a session cookie from a private page to sign-in, keeping the destination", () => {
    const res = proxy(new NextRequest("http://localhost/settings?tab=members"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost/sign-in?next=%2Fsettings%3Ftab%3Dmembers",
    );
  });

  it("lets public and auth pages through without a cookie", () => {
    for (const path of [
      "/",
      "/sign-in",
      "/sign-up",
      "/invitations/accept",
      "/api/auth/get-session",
    ]) {
      expect(
        proxy(new NextRequest(`http://localhost${path}`)).headers.get("location"),
        path,
      ).toBeNull();
    }
  });

  it("lets a request with a session cookie through; the layout then verifies it with the API", () => {
    const res = proxy(
      new NextRequest("http://localhost/home", {
        headers: { cookie: "originos.session_token=abc" },
      }),
    );
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-request-x-originos-path")).toBe("/home");
  });
});
