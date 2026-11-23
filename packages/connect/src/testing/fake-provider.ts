// A fake OAuth 2.0 provider for tests and local development ONLY (Phase 08).
// It is not a real integration: it runs in memory on this machine, and it
// refuses to start when NODE_ENV=production. It implements just enough of
// RFC 6749 / 7636 / 7009 to test OriginOS honestly: PKCE (S256), single-use
// codes bound to client and redirect URI, refresh token rotation, revocation,
// a bearer-protected API, idempotency-key accounting and failure injection.
import { createHash, randomBytes } from "node:crypto";
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { signOriginosWebhook } from "../webhooks.js";

/** Every token this provider issues starts with this, so tests can search for leaks. */
export const FAKE_TOKEN_PREFIX = "ftp_";

export interface FakeProviderOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly port?: number;
  readonly host?: string;
  /** Access token lifetime. Default one hour. */
  readonly accessTokenSeconds?: number;
}

interface CodeGrant {
  clientId: string;
  redirectUri: string;
  challenge: string;
  scopes: string[];
  expiresAt: number;
  used: boolean;
  issued: string[];
}

interface TokenGrant {
  kind: "access" | "refresh";
  scopes: string[];
  expiresAt: number | null;
  revoked: boolean;
  family: string;
}

export interface FakeProviderState {
  readonly codesIssued: number;
  readonly tokenRequests: number;
  readonly revocations: number;
  readonly apiCalls: number;
  /** Idempotency-Key values seen by /api/echo, with how often each arrived. */
  readonly echoKeys: Readonly<Record<string, number>>;
  /** Echo requests applied (a repeated key is not applied twice). */
  readonly echoApplied: number;
}

export interface FakeProvider {
  readonly url: string;
  readonly clientId: string;
  state(): FakeProviderState;
  /** Approve an authorize URL as the test user would; returns the redirect URL with code and state. */
  approve(authorizeUrl: string): string;
  /** The next `count` API calls answer `status`. */
  failNext(status: number, count?: number): void;
  /** Revoke everything at the provider (as if the user removed the app there). */
  revokeAll(): void;
  /** Expire every access token now (refresh tokens stay valid). */
  expireAccessTokens(): void;
  reset(): void;
  /** Send a signed webhook to `url`, as the provider would. */
  sendWebhook(input: {
    url: string;
    secret: string;
    event: string;
    body: unknown;
    deliveryId?: string;
    timestamp?: number;
  }): Promise<{ status: number; body: unknown; deliveryId: string }>;
  close(): Promise<void>;
}

const s256 = (v: string) => createHash("sha256").update(v, "ascii").digest("base64url");
const token = (kind: string) =>
  `${FAKE_TOKEN_PREFIX}${kind}_${randomBytes(24).toString("base64url")}`;
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

export async function startFakeProvider(options: FakeProviderOptions): Promise<FakeProvider> {
  if (process.env.NODE_ENV === "production")
    throw new Error("The fake OAuth provider is for tests and local development only.");
  const accessSeconds = options.accessTokenSeconds ?? 3600;
  const codes = new Map<string, CodeGrant>();
  const tokens = new Map<string, TokenGrant>();
  let counters = { codesIssued: 0, tokenRequests: 0, revocations: 0, apiCalls: 0, echoApplied: 0 };
  let echoKeys: Record<string, number> = {};
  let failures: { status: number; remaining: number } | null = null;

  const checkClient = (req: IncomingMessage, form: URLSearchParams): boolean => {
    const auth = req.headers.authorization;
    let id = form.get("client_id");
    let secret = form.get("client_secret");
    if (auth?.startsWith("Basic ")) {
      const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
      const at = decoded.indexOf(":");
      id = decoded.slice(0, at);
      secret = decoded.slice(at + 1);
    }
    return id === options.clientId && secret === options.clientSecret;
  };

  const parseAuthorize = (url: URL) => {
    const p = url.searchParams;
    const problems: string[] = [];
    if (p.get("response_type") !== "code") problems.push("response_type must be code");
    if (p.get("client_id") !== options.clientId) problems.push("unknown client_id");
    if (!p.get("redirect_uri")) problems.push("redirect_uri is required");
    if (!p.get("state")) problems.push("state is required");
    if (p.get("code_challenge_method") !== "S256" || !p.get("code_challenge"))
      problems.push("PKCE with S256 is required");
    return {
      problems,
      redirectUri: p.get("redirect_uri") ?? "",
      state: p.get("state") ?? "",
      challenge: p.get("code_challenge") ?? "",
      scopes: (p.get("scope") ?? "").split(" ").filter(Boolean),
    };
  };

  const issueCode = (a: ReturnType<typeof parseAuthorize>): string => {
    const code = `code_${randomBytes(16).toString("base64url")}`;
    codes.set(code, {
      clientId: options.clientId,
      redirectUri: a.redirectUri,
      challenge: a.challenge,
      scopes: a.scopes,
      expiresAt: Date.now() + 60_000,
      used: false,
      issued: [],
    });
    counters.codesIssued += 1;
    const to = new URL(a.redirectUri);
    to.searchParams.set("code", code);
    to.searchParams.set("state", a.state);
    return to.toString();
  };

  const issueTokens = (scopes: string[], family: string) => {
    const access = token("at");
    const refresh = token("rt");
    tokens.set(access, {
      kind: "access",
      scopes,
      expiresAt: Date.now() + accessSeconds * 1000,
      revoked: false,
      family,
    });
    tokens.set(refresh, { kind: "refresh", scopes, expiresAt: null, revoked: false, family });
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: "bearer",
      expires_in: accessSeconds,
      scope: scopes.join(" "),
    };
  };

  const revokeFamily = (family: string) => {
    for (const grant of tokens.values()) if (grant.family === family) grant.revoked = true;
  };

  const bearer = (req: IncomingMessage): TokenGrant | null => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return null;
    const grant = tokens.get(auth.slice(7));
    if (!grant || grant.kind !== "access" || grant.revoked) return null;
    if (grant.expiresAt !== null && grant.expiresAt <= Date.now()) return null;
    return grant;
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://fake.invalid");
    const route = `${req.method} ${url.pathname}`;

    if (route === "GET /health") return json(res, 200, { status: "ok", testOnly: true });

    if (route === "GET /oauth/authorize") {
      const a = parseAuthorize(url);
      res.writeHead(a.problems.length ? 400 : 200, { "content-type": "text/html; charset=utf-8" });
      if (a.problems.length) {
        res.end(
          `<!doctype html><title>Request refused</title><h1>Request refused</h1><p>${escapeHtml(a.problems.join("; "))}</p>`,
        );
        return;
      }
      const hidden = escapeHtml(url.search.slice(1));
      res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Test provider: authorize</title></head>
<body><main><h1>Test provider (local testing only)</h1>
<p>OriginOS is asking for: ${escapeHtml(a.scopes.join(", ") || "no scopes")}.</p>
<form method="post" action="/oauth/authorize/decision">
<input type="hidden" name="q" value="${hidden}">
<button name="decision" value="approve">Approve</button>
<button name="decision" value="deny">Deny</button>
</form></main></body></html>`);
      return;
    }

    if (route === "POST /oauth/authorize/decision") {
      const form = new URLSearchParams(await readBody(req));
      const a = parseAuthorize(new URL(`http://fake.invalid/?${form.get("q") ?? ""}`));
      if (a.problems.length) return json(res, 400, { error: "invalid_request" });
      let location: string;
      if (form.get("decision") === "approve") location = issueCode(a);
      else {
        const to = new URL(a.redirectUri);
        to.searchParams.set("error", "access_denied");
        to.searchParams.set("state", a.state);
        location = to.toString();
      }
      res.writeHead(302, { location });
      res.end();
      return;
    }

    if (route === "POST /oauth/token") {
      counters.tokenRequests += 1;
      const form = new URLSearchParams(await readBody(req));
      if (!checkClient(req, form)) return json(res, 401, { error: "invalid_client" });
      const grantType = form.get("grant_type");
      if (grantType === "authorization_code") {
        const code = codes.get(form.get("code") ?? "");
        if (!code) return json(res, 400, { error: "invalid_grant" });
        if (code.used) {
          // RFC 6749 §10.5: a reused code revokes what it issued.
          for (const t of code.issued) revokeFamily(tokens.get(t)?.family ?? "");
          return json(res, 400, { error: "invalid_grant" });
        }
        code.used = true;
        if (code.expiresAt < Date.now() || code.redirectUri !== form.get("redirect_uri"))
          return json(res, 400, { error: "invalid_grant" });
        if (s256(form.get("code_verifier") ?? "") !== code.challenge)
          return json(res, 400, { error: "invalid_grant" });
        const issued = issueTokens(code.scopes, randomBytes(8).toString("hex"));
        code.issued.push(issued.access_token);
        return json(res, 200, issued);
      }
      if (grantType === "refresh_token") {
        const old = tokens.get(form.get("refresh_token") ?? "");
        if (!old || old.kind !== "refresh" || old.revoked)
          return json(res, 400, { error: "invalid_grant" });
        old.revoked = true; // rotation: each refresh token works once
        for (const [t, g] of tokens)
          if (g.family === old.family && g.kind === "access") tokens.get(t)!.revoked = true;
        return json(res, 200, issueTokens(old.scopes, old.family));
      }
      return json(res, 400, { error: "unsupported_grant_type" });
    }

    if (route === "POST /oauth/revoke") {
      const form = new URLSearchParams(await readBody(req));
      if (!checkClient(req, form)) return json(res, 401, { error: "invalid_client" });
      const grant = tokens.get(form.get("token") ?? "");
      if (grant) revokeFamily(grant.family);
      counters.revocations += 1;
      res.writeHead(200).end();
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      counters.apiCalls += 1;
      if (failures && failures.remaining > 0) {
        failures.remaining -= 1;
        return json(res, failures.status, { error: "injected_failure" });
      }
      const grant = bearer(req);
      if (!grant) return json(res, 401, { error: "invalid_token" });
      if (route === "GET /api/me") return json(res, 200, { id: "tp-user-1", login: "test-user" });
      if (route === "POST /api/echo") {
        const body = (await readBody(req)) || "null";
        const key = req.headers["idempotency-key"];
        const k = typeof key === "string" ? key : "";
        const seen = k ? (echoKeys[k] ?? 0) : 0;
        if (k) echoKeys = { ...echoKeys, [k]: seen + 1 };
        if (seen === 0) counters.echoApplied += 1;
        return json(res, 200, { echoed: JSON.parse(body) as unknown, duplicate: seen > 0 });
      }
      return json(res, 404, { error: "not_found" });
    }

    json(res, 404, { error: "not_found" });
  };

  const server: Server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) json(res, 400, { error: "invalid_request" });
      else res.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, options.host ?? "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  const url = `http://${options.host ?? "127.0.0.1"}:${address.port}`;

  return {
    url,
    clientId: options.clientId,
    state: () => ({ ...counters, echoKeys: { ...echoKeys } }),
    approve(authorizeUrl) {
      const a = parseAuthorize(new URL(authorizeUrl));
      if (a.problems.length) throw new Error(`authorize request refused: ${a.problems.join("; ")}`);
      return issueCode(a);
    },
    failNext(status, count = 1) {
      failures = { status, remaining: count };
    },
    revokeAll() {
      for (const grant of tokens.values()) grant.revoked = true;
    },
    expireAccessTokens() {
      for (const grant of tokens.values())
        if (grant.kind === "access") grant.expiresAt = Date.now() - 1;
    },
    reset() {
      codes.clear();
      tokens.clear();
      counters = { codesIssued: 0, tokenRequests: 0, revocations: 0, apiCalls: 0, echoApplied: 0 };
      echoKeys = {};
      failures = null;
    },
    async sendWebhook(input) {
      const raw = JSON.stringify(input.body);
      const deliveryId = input.deliveryId ?? `dlv_${randomBytes(8).toString("hex")}`;
      const res = await fetch(input.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-originos-signature": signOriginosWebhook(input.secret, raw, input.timestamp),
          "x-originos-delivery": deliveryId,
          "x-originos-event": input.event,
        },
        body: raw,
      });
      return { status: res.status, body: await res.json().catch(() => null), deliveryId };
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
