// TEST ONLY. A challenge checker that answers from fixed records instead of
// the internet, so tests can pass and fail domain challenges deterministically.
// The worker refuses to use it when NODE_ENV=production.
import { readFileSync } from "node:fs";
import {
  type ChallengeChecker,
  type CheckResult,
  type DomainMethod,
  dnsRecordName,
  dnsRecordsMatch,
  htmlBodyMatches,
} from "../challenge.js";

export interface ChallengeFixtures {
  /** TXT values by record name (e.g. "_originos-challenge.example.com"). */
  dns?: Record<string, string[]>;
  /** File body by domain. */
  html?: Record<string, string>;
  /** Domains whose lookups "time out" (transient failures). */
  unreachable?: string[];
}

function answer(
  f: ChallengeFixtures,
  domain: string,
  method: DomainMethod,
  challenge: string,
): CheckResult {
  if (f.unreachable?.includes(domain))
    return { ok: false, detail: "The lookup did not complete (fixture).", transient: true };
  if (method === "dns_txt") {
    const values = f.dns?.[dnsRecordName(domain)];
    if (!values)
      return {
        ok: false,
        detail: `No TXT record was found at ${dnsRecordName(domain)}.`,
        transient: false,
      };
    return dnsRecordsMatch(
      values.map((v) => [v]),
      challenge,
    )
      ? { ok: true }
      : {
          ok: false,
          detail: `No TXT record at ${dnsRecordName(domain)} has the expected value.`,
          transient: false,
        };
  }
  const body = f.html?.[domain];
  if (body === undefined)
    return { ok: false, detail: "The file URL answered HTTP 404.", transient: false };
  return htmlBodyMatches(body, challenge)
    ? { ok: true }
    : { ok: false, detail: "The file does not contain the expected value.", transient: false };
}

/** Answers from an object you can change between checks. */
export function fixtureChecker(
  fixtures: ChallengeFixtures = {},
): ChallengeChecker & { fixtures: ChallengeFixtures } {
  return {
    kind: "fixture",
    fixtures,
    check: async (domain, method, challenge) => answer(fixtures, domain, method, challenge),
  };
}

/** Answers from a JSON file read on every check (browser tests write it while running). */
export function fileFixtureChecker(path: string): ChallengeChecker {
  return {
    kind: "fixture",
    check: async (domain, method, challenge) => {
      let fixtures: ChallengeFixtures = {};
      try {
        fixtures = JSON.parse(readFileSync(path, "utf8")) as ChallengeFixtures;
      } catch {
        fixtures = {};
      }
      return answer(fixtures, domain, method, challenge);
    },
  };
}
