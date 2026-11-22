import { describe, expect, it } from "vitest";
import { fetchApiStatus } from "../src/lib/api-status";

const ok = {
  service: "api",
  status: "ok",
  version: "0.0.0-dev",
  checkedAt: "2026-11-22T00:00:00.000Z",
  checks: { database: { status: "not_configured", detail: "DATABASE_URL is not set" } },
};

const respond = (status: number, body: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

describe("fetchApiStatus", () => {
  it("is ready when the API returns 200 with a valid ok body", async () => {
    const status = await fetchApiStatus("http://api.test", respond(200, ok));
    expect(status.kind).toBe("ready");
  });

  it("is not ready on 503 with a valid body", async () => {
    const body = { ...ok, status: "down", checks: { database: { status: "unreachable" } } };
    expect((await fetchApiStatus("http://api.test", respond(503, body))).kind).toBe("not_ready");
  });

  it("is unreachable when the request fails", async () => {
    const failing = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect((await fetchApiStatus("http://api.test", failing)).kind).toBe("unreachable");
  });

  it("rejects bodies that do not match the health contract or name another service", async () => {
    expect((await fetchApiStatus("http://api.test", respond(200, { ok: true }))).kind).toBe(
      "invalid_response",
    );
    expect(
      (await fetchApiStatus("http://api.test", respond(200, { ...ok, service: "web" }))).kind,
    ).toBe("invalid_response");
    const notJson = (async () => new Response("<html>", { status: 200 })) as typeof fetch;
    expect((await fetchApiStatus("http://api.test", notJson)).kind).toBe("invalid_response");
  });

  it("calls /health/ready on the configured base URL", async () => {
    let calledWith = "";
    const spy = (async (input: RequestInfo | URL) => {
      calledWith = String(input);
      return new Response(JSON.stringify(ok), { status: 200 });
    }) as typeof fetch;
    await fetchApiStatus("http://127.0.0.1:4000", spy);
    expect(calledWith).toBe("http://127.0.0.1:4000/health/ready");
  });
});
