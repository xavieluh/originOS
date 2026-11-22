import { describe, expect, it } from "vitest";
import { logEvent } from "../src/lib/log";

describe("logEvent", () => {
  it("writes one JSON line with the shared field names", () => {
    const lines: string[] = [];
    logEvent("warn", "probe", { correlationId: "abc12345" }, (l) => lines.push(l));
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? "");
    expect(parsed).toMatchObject({
      level: 40,
      service: "web",
      msg: "probe",
      correlationId: "abc12345",
    });
    expect(lines[0]?.endsWith("\n")).toBe(true);
  });
});
