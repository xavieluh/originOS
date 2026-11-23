// Live challenge lookups, written for hostile input (THREAT_MODEL B7, SSRF):
//  * DNS: one TXT query with a short timeout and a size cap on the answer.
//  * HTML file: HTTPS only, port 443, every resolved address must be public,
//    the connection is pinned to the address that was checked (no second
//    lookup an attacker could change), certificates are verified, redirects
//    are refused, and at most 4 KB is read within 5 seconds.
// Runs in the worker only.
import { Resolver, lookup as dnsLookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { HTML_CHALLENGE_PATH } from "@originos/contracts";
import {
  type ChallengeChecker,
  type CheckResult,
  type DomainMethod,
  dnsRecordName,
  dnsRecordsMatch,
  htmlBodyMatches,
} from "./challenge.js";

const blocked4 = new BlockList();
// Separate lists: Node matches IPv4 addresses against IPv4-mapped IPv6 rules too.
const blocked6 = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked4.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  // Mapped IPv4 in hex form is refused outright; the dotted form is judged as IPv4 below.
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const)
  blocked6.addSubnet(net, prefix, "ipv6");

/** True only for globally routable unicast addresses. IPv4-mapped IPv6 is judged as IPv4. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked4.check(address, "ipv4");
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return !blocked4.check(mapped[1]!, "ipv4");
    return !blocked6.check(address, "ipv6");
  }
  return false;
}

export interface LiveCheckerOptions {
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
}

const fail = (detail: string, transient = false): CheckResult => ({ ok: false, detail, transient });

async function checkDns(
  domain: string,
  challenge: string,
  timeoutMs: number,
): Promise<CheckResult> {
  const resolver = new Resolver({ timeout: timeoutMs, tries: 2 });
  try {
    const records = await resolver.resolveTxt(dnsRecordName(domain));
    // Refuse absurd answers rather than scanning them.
    if (records.length > 50) return fail("The TXT record set is too large to check.");
    return dnsRecordsMatch(records, challenge)
      ? { ok: true }
      : fail(`No TXT record at ${dnsRecordName(domain)} has the expected value.`);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENODATA" || code === "ENOTFOUND")
      return fail(`No TXT record was found at ${dnsRecordName(domain)}.`);
    return fail("The DNS lookup did not complete. OriginOS will try again.", true);
  }
}

async function publicAddressFor(
  domain: string,
): Promise<{ address: string; family: 4 | 6 } | string> {
  let addresses;
  try {
    addresses = await dnsLookup(domain, { all: true, verbatim: true });
  } catch {
    return `${domain} does not resolve.`;
  }
  if (addresses.length === 0) return `${domain} does not resolve.`;
  // Every address must be public: a name that also points inside a network is refused.
  if (!addresses.every((a) => isPublicAddress(a.address)))
    return `${domain} resolves to a private or reserved address, which OriginOS does not contact.`;
  const first = addresses[0]!;
  return { address: first.address, family: first.family === 6 ? 6 : 4 };
}

function fetchPinned(
  domain: string,
  pinned: { address: string; family: 4 | 6 },
  timeoutMs: number,
  maxBytes: number,
): Promise<CheckResult & { body?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: CheckResult & { body?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.destroy();
      resolve(r);
    };
    const req = request(
      {
        host: domain,
        servername: domain,
        port: 443,
        path: HTML_CHALLENGE_PATH,
        method: "GET",
        headers: { "user-agent": "OriginOS-ownership-check/1", accept: "text/plain" },
        // Connect to the address that was checked, never a fresh lookup.
        lookup: (_host, options, callback) => {
          const opts = options as { all?: boolean };
          if (opts.all) callback(null, [{ address: pinned.address, family: pinned.family }]);
          else callback(null, pinned.address, pinned.family);
        },
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400)
          return done(fail("The file URL redirects. Serve the file directly at that address."));
        if (status !== 200) return done(fail(`The file URL answered HTTP ${status}.`));
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) return done(fail("The file is larger than expected."));
          chunks.push(chunk);
        });
        res.on("end", () => done({ ok: true, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", () => done(fail("The download did not complete.", true)));
      },
    );
    const timer = setTimeout(
      () => done(fail("The website did not answer in time. OriginOS will try again.", true)),
      timeoutMs,
    );
    req.on("error", (error: NodeJS.ErrnoException) => {
      const tls = error.code?.startsWith("ERR_TLS") || /certificate/i.test(error.message);
      done(
        tls
          ? fail("The website's HTTPS certificate is not valid for this domain.")
          : fail("OriginOS could not connect to the website. It will try again.", true),
      );
    });
    req.end();
  });
}

async function checkHtml(
  domain: string,
  challenge: string,
  timeoutMs: number,
  maxBytes: number,
): Promise<CheckResult> {
  const pinned = await publicAddressFor(domain);
  if (typeof pinned === "string") return fail(pinned);
  const result = await fetchPinned(domain, pinned, timeoutMs, maxBytes);
  if (!result.ok) return result;
  return htmlBodyMatches(result.body ?? "", challenge)
    ? { ok: true }
    : fail(
        `The file at https://${domain}${HTML_CHALLENGE_PATH} does not contain the expected value.`,
      );
}

/** The production checker. */
export function liveChecker(options: LiveCheckerOptions = {}): ChallengeChecker {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const maxBytes = options.maxBytes ?? 4_096;
  return {
    kind: "live",
    check(domain: string, method: DomainMethod, challenge: string) {
      return method === "dns_txt"
        ? checkDns(domain, challenge, timeoutMs)
        : checkHtml(domain, challenge, timeoutMs, maxBytes);
    },
  };
}
