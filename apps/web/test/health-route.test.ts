import { HealthResponse } from "@originos/contracts";
import { describe, expect, it } from "vitest";
import { GET } from "../src/app/api/health/route";

describe("GET /api/health (web liveness)", () => {
  it("returns a contract-valid response and disables caching", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(HealthResponse.parse(await res.json())).toMatchObject({ service: "web", status: "ok" });
  });
});
