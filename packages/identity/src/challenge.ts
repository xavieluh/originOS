// Ownership challenges for domains (MASTER_SPEC §3 "Domain/account
// controlled"): OriginOS issues a random value, the person publishes it where
// only someone in control of the domain can, and the worker looks for it.
// Passing shows control at that moment, nothing more.
import { randomBytes } from "node:crypto";
import {
  CHALLENGE_PREFIX,
  type ChallengeInstructions,
  DNS_CHALLENGE_LABEL,
  HTML_CHALLENGE_PATH,
} from "@originos/contracts";

export type DomainMethod = "dns_txt" | "html_file";

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/** A fresh challenge value: the prefix and 32 random base32 characters (160 bits). */
export function newChallenge(): string {
  const bytes = randomBytes(20);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return `${CHALLENGE_PREFIX}${out}`;
}

export const dnsRecordName = (domain: string) => `${DNS_CHALLENGE_LABEL}.${domain}`;
export const htmlFileUrl = (domain: string) => `https://${domain}${HTML_CHALLENGE_PATH}`;

export function instructions(
  domain: string,
  method: DomainMethod,
  challenge: string,
): ChallengeInstructions {
  return method === "dns_txt"
    ? { method, location: dnsRecordName(domain), value: challenge }
    : { method, location: htmlFileUrl(domain), value: challenge };
}

/** The validation mechanism recorded on the identity claim. */
export const MECHANISMS: Readonly<Record<DomainMethod, string>> = {
  dns_txt: "dns_txt_record",
  html_file: "https_well_known_file",
};

export type CheckResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      /** Plain words for the person; never includes fetched content. */
      readonly detail: string;
      /** A lookup problem that may pass on retry (timeout, server failure). */
      readonly transient: boolean;
    };

/** The TXT strings of one record are joined, as DNS splits long values. Exact match only. */
export function dnsRecordsMatch(
  records: readonly (readonly string[])[],
  challenge: string,
): boolean {
  return records.some((chunks) => chunks.join("").trim() === challenge);
}

/** The file must contain exactly the value (surrounding whitespace allowed). */
export function htmlBodyMatches(body: string, challenge: string): boolean {
  return body.trim() === challenge;
}

/** Looks for a published challenge. The live implementation is in net.ts; tests use a fixture. */
export interface ChallengeChecker {
  readonly kind: "live" | "fixture";
  check(domain: string, method: DomainMethod, challenge: string): Promise<CheckResult>;
}
