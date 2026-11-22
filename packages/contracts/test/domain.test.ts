import { describe, expect, it } from "vitest";
import {
  ASSURANCE_LABELS,
  EventEnvelope,
  OBJECT_KINDS,
  RELATION_RULES,
  idBody,
  idOf,
  kindOf,
  newEventId,
  newId,
  relationAllowed,
} from "../src/index.js";

describe("ids", () => {
  it("are prefixed by kind, 26 Crockford characters, and parse back to their kind", () => {
    for (const kind of Object.keys(OBJECT_KINDS) as (keyof typeof OBJECT_KINDS)[]) {
      const id = newId(kind);
      expect(id).toMatch(/^[a-z]{3}_[0-9a-hjkmnp-tv-z]{26}$/);
      expect(kindOf(id)).toBe(kind);
      expect(idOf(kind).safeParse(id).success).toBe(true);
    }
    expect(kindOf(newEventId())).toBeNull();
  });

  it("sort by creation time and never collide in practice", () => {
    const a = `wrk_${idBody(1_700_000_000_000)}`;
    const b = `wrk_${idBody(1_700_000_000_001)}`;
    expect(a < b).toBe(true);
    const many = new Set(Array.from({ length: 10_000 }, () => newId("work")));
    expect(many.size).toBe(10_000);
  });

  it("encode time exactly (zero time and fixed randomness)", () => {
    expect(idBody(0, (n) => new Uint8Array(n))).toBe("0".repeat(26));
    expect(idBody(0, (n) => new Uint8Array(n).fill(255))).toBe("0".repeat(10) + "z".repeat(16));
  });

  it("reject malformed or unknown ids", () => {
    for (const bad of [
      "wrk_",
      "xyz_" + "0".repeat(26),
      "wrk_" + "u".repeat(26),
      "wrk_a_b",
      "WRK_" + "0".repeat(26),
    ])
      expect(kindOf(bad), bad).toBeNull();
    expect(idOf("work").safeParse(newId("source")).success).toBe(false);
  });
});

describe("vocabulary", () => {
  it("has exactly the seven assurance labels of MASTER_SPEC §3", () => {
    expect(ASSURANCE_LABELS).toHaveLength(7);
  });

  it("allows only whitelisted relation triples", () => {
    expect(relationAllowed("CITES", "work_version", "source")).toBe(true);
    expect(relationAllowed("CITES", "source", "work_version")).toBe(false);
    expect(relationAllowed("SUPPORTS", "work", "subject")).toBe(false);
    expect(new Set(RELATION_RULES.map((r) => r.join())).size).toBe(RELATION_RULES.length);
  });
});

describe("event envelope", () => {
  it("accepts a well-formed event and refuses bad types", () => {
    const event = {
      eventId: newEventId(),
      tenantId: "7b0c6d1e-1111-4222-8333-444455556666",
      type: "work.version_created",
      schemaVersion: 1,
      subjectRef: newId("work_version"),
      payload: { workId: newId("work") },
      correlationId: null,
      causationId: null,
      occurredAt: new Date().toISOString(),
    };
    expect(EventEnvelope.safeParse(event).success).toBe(true);
    expect(EventEnvelope.safeParse({ ...event, type: "Work Created" }).success).toBe(false);
  });
});
