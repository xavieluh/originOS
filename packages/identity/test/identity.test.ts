import { CHALLENGE_PREFIX } from "@originos/contracts";
import { describe, expect, it } from "vitest";
import {
  type ProofFacts,
  badgesFor,
  dnsRecordsMatch,
  htmlBodyMatches,
  instructions,
  isPublicAddress,
  liveChecker,
  newChallenge,
  normalizeDomain,
  proofBadge,
  reviewBadge,
} from "../src/index.js";
import { fixtureChecker } from "../src/testing/index.js";

describe("normalizeDomain", () => {
  it.each([
    ["Example.COM", "example.com"],
    ["https://blog.example.com/", "blog.example.com"],
    ["example.com.", "example.com"],
    ["bücher.de", "xn--bcher-kva.de"],
  ])("accepts %s as %s", (input, domain) => {
    expect(normalizeDomain(input)).toEqual({ ok: true, domain });
  });

  it.each([
    "localhost",
    "127.0.0.1",
    "[::1]",
    "intranet",
    "printer.local",
    "svc.internal",
    "site.test",
    "x.invalid",
    "https://example.com/path",
    "https://example.com:8443",
    "-bad-.com",
    "a..com",
    "example.123",
  ])("refuses %s", (input) => {
    expect(normalizeDomain(input).ok).toBe(false);
  });
});

describe("isPublicAddress", () => {
  it.each(["93.184.215.14", "2606:2800:21f:cb07:6820:80da:af6b:8b2c", "1.1.1.1"])(
    "allows %s",
    (ip) => expect(isPublicAddress(ip)).toBe(true),
  );
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::7f00:1",
    "not-an-ip",
  ])("refuses %s", (ip) => expect(isPublicAddress(ip)).toBe(false));
});

describe("challenges", () => {
  it("issues unguessable values with the OriginOS prefix", () => {
    const a = newChallenge();
    const b = newChallenge();
    expect(a).toMatch(new RegExp(`^${CHALLENGE_PREFIX}[a-z2-7]{32}$`));
    expect(a).not.toBe(b);
  });

  it("tells the person exactly where to publish it", () => {
    expect(instructions("example.com", "dns_txt", "v")).toEqual({
      method: "dns_txt",
      location: "_originos-challenge.example.com",
      value: "v",
    });
    expect(instructions("example.com", "html_file", "v").location).toBe(
      "https://example.com/.well-known/originos-verify.txt",
    );
  });

  it("matches exactly, joining split TXT strings", () => {
    const value = newChallenge();
    expect(dnsRecordsMatch([[value.slice(0, 10), value.slice(10)]], value)).toBe(true);
    expect(dnsRecordsMatch([["v=spf1 -all"], [`${value}x`]], value)).toBe(false);
    expect(htmlBodyMatches(`${value}\n`, value)).toBe(true);
    expect(htmlBodyMatches(`<html>${value}</html>`, value)).toBe(false);
  });

  it("the live checker never contacts a private address", async () => {
    const result = await liveChecker({ timeoutMs: 2_000 }).check("localhost", "html_file", "x");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toMatch(/private or reserved|does not resolve/);
  });

  it("the fixture checker passes and fails deterministically", async () => {
    const value = newChallenge();
    const checker = fixtureChecker({ dns: { "_originos-challenge.example.com": [value] } });
    expect(await checker.check("example.com", "dns_txt", value)).toEqual({ ok: true });
    expect((await checker.check("example.com", "html_file", value)).ok).toBe(false);
    checker.fixtures.unreachable = ["example.com"];
    expect(await checker.check("example.com", "dns_txt", value)).toMatchObject({
      ok: false,
      transient: true,
    });
  });
});

describe("badges", () => {
  const checked = new Date("2026-01-10T12:00:00Z");
  const proof = (over: Partial<ProofFacts> = {}): ProofFacts => ({
    id: "prv_1",
    kind: "domain",
    method: "dns_txt",
    label: "example.com",
    provider: null,
    status: "verified",
    lastVerifiedAt: checked,
    expiresAt: new Date("2026-04-10T12:00:00Z"),
    staleReason: null,
    revokedAt: null,
    revokedReason: null,
    ...over,
  });

  it("a pending proof earns no badge", () => {
    expect(proofBadge(proof({ status: "pending", lastVerifiedAt: null }), checked)).toBeNull();
  });

  it("a current badge says what, how, when and what it does not show", () => {
    const b = proofBadge(proof(), new Date("2026-02-01T00:00:00Z"))!;
    expect(b).toMatchObject({
      assurance: "domain_or_account_controlled",
      label: "Controls example.com",
      state: "current",
      stateNote: null,
    });
    expect(b.method).toMatch(/DNS TXT record.*2026-01-10/);
    expect(b.limitations).toMatch(/does not show legal ownership, legal identity/);
  });

  it("past its expiry a badge reads expired, never current", () => {
    const b = proofBadge(proof(), new Date("2026-04-10T12:00:00Z"))!;
    expect(b.state).toBe("expired");
    expect(b.stateNote).toMatch(/expired on 2026-04-10/);
  });

  it("stale and revoked proofs are labeled with the reason", () => {
    const stale = proofBadge(
      proof({ status: "stale", staleReason: "The re-check failed." }),
      checked,
    )!;
    expect(stale).toMatchObject({ state: "stale", stateNote: "The re-check failed." });
    const revoked = proofBadge(
      proof({
        status: "revoked",
        revokedAt: new Date("2026-02-02T00:00:00Z"),
        revokedReason: "ownership_changed",
      }),
      checked,
    )!;
    expect(revoked.state).toBe("revoked");
    expect(revoked.stateNote).toBe("Ended when the profile changed owner on 2026-02-02.");
  });

  it("account badges name the provider; reviewed claims say who reviewed and that OriginOS did not", () => {
    const b = proofBadge(
      proof({ kind: "account", method: "oauth", label: "octocat", provider: "github" }),
      checked,
      "GitHub",
    )!;
    expect(b.label).toBe("Controls the GitHub account octocat");
    const r = reviewBadge(
      {
        id: "rvw_1",
        claimType: "affiliation",
        statement: "Staff writer at The Daily",
        status: "approved",
        decidedAt: checked,
        revokedAt: null,
        reviewerLabel: "Acme Media",
      },
      checked,
    )!;
    expect(r).toMatchObject({ assurance: "identity_reviewed", state: "current" });
    expect(r.method).toMatch(/A reviewer at Acme Media/);
    expect(r.limitations).toMatch(/OriginOS did not check the claim itself/);
  });

  it("orders current badges before lapsed ones", () => {
    const list = badgesFor({
      proofs: [
        proof({ id: "a", status: "stale", staleReason: "x" }),
        proof({ id: "b" }),
        proof({ id: "c", status: "pending", lastVerifiedAt: null }),
      ],
      reviews: [],
      now: checked,
    });
    expect(list.map((b) => [b.id, b.state])).toEqual([
      ["b", "current"],
      ["a", "stale"],
    ]);
  });
});
