// Domain names people can prove: public DNS names only, normalized so that the
// same domain always compares equal (lowercase ASCII, punycode, no trailing dot).
import { domainToASCII } from "node:url";
import { isIP } from "node:net";

/** Suffixes that never name a public website (RFC 6761, RFC 6762, RFC 7686, and common private use). */
const NON_PUBLIC_SUFFIXES = [
  "localhost",
  "local",
  "localdomain",
  "internal",
  "intranet",
  "lan",
  "home",
  "home.arpa",
  "corp",
  "test",
  "invalid",
  "example",
  "onion",
  "arpa",
];

export type DomainResult =
  { readonly ok: true; readonly domain: string } | { readonly ok: false; readonly reason: string };

/**
 * Normalize what a person typed into a domain name, or say why it cannot be
 * proved. Accepts "Example.com", "https://example.com/" and IDNs; refuses IP
 * addresses, single labels and non-public suffixes.
 */
export function normalizeDomain(input: string): DomainResult {
  let raw = input.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.pathname !== "/" || url.search || url.hash || url.port || url.username)
        return { ok: false, reason: "Enter only the domain name, without a path, port or query." };
      raw = url.hostname;
    } catch {
      return { ok: false, reason: "That is not a valid domain name." };
    }
  }
  raw = raw.replace(/\.$/, "");
  if (raw.startsWith("[") || isIP(raw) !== 0)
    return { ok: false, reason: "Prove a domain name, not an IP address." };
  const ascii = domainToASCII(raw.toLowerCase());
  if (!ascii || ascii.length > 253)
    return { ok: false, reason: "That is not a valid domain name." };
  const labels = ascii.split(".");
  if (labels.length < 2)
    return { ok: false, reason: "Enter a full domain name, such as example.com." };
  for (const label of labels) {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
      return { ok: false, reason: "That is not a valid domain name." };
  }
  const tld = labels[labels.length - 1]!;
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld))
    return { ok: false, reason: "That is not a valid domain name." };
  for (const suffix of NON_PUBLIC_SUFFIXES) {
    if (ascii === suffix || ascii.endsWith(`.${suffix}`))
      return { ok: false, reason: "That domain is not on the public internet." };
  }
  return { ok: true, domain: ascii };
}
