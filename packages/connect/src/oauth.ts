// OAuth 2.0 authorization code with PKCE, refresh, revocation and API calls
// (Phase 08, ADR-027). Every request has a timeout. Errors carry a kind and an
// HTTP status, never a token, a client secret or a provider response body.
import type { AccountIdentity, ProviderConfig } from "./providers.js";

export const PROVIDER_TIMEOUT_MS = 10_000;

export type ProviderErrorKind =
  /** The code or refresh token was rejected: start again or reconnect. */
  | "invalid_grant"
  /** The access token was rejected (revoked or expired at the provider). */
  | "unauthorized"
  /** Network failure, timeout, rate limit or 5xx: worth retrying later. */
  | "unavailable"
  /** Any other refusal (4xx). */
  | "refused"
  /** The provider answered with something this client cannot use. */
  | "bad_response"
  /** This deployment has no credentials for the provider. */
  | "not_configured";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "ProviderError";
  }
  get retryable(): boolean {
    return this.kind === "unavailable";
  }
}

export interface TokenSet {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: Date | null;
  readonly scopes: readonly string[];
}

/** OAuth error codes that are safe to echo (RFC 6749 §5.2 plus GitHub's). */
const SAFE_ERROR = /^[a-z_]{3,40}$/;

function credentials(config: ProviderConfig): { id: string; secret: string } {
  if (!config.clientId || !config.clientSecret)
    throw new ProviderError("not_configured", `${config.definition.name} is not set up.`);
  return { id: config.clientId, secret: config.clientSecret };
}

async function send(url: string, init: RequestInit, what: string): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    throw new ProviderError(
      "unavailable",
      `${what}: ${timeout ? "timed out" : "could not connect"}.`,
    );
  }
}

function statusError(status: number, what: string): ProviderError {
  if (status === 401)
    return new ProviderError("unauthorized", `${what}: the provider refused the token.`, status);
  if (status === 429 || status >= 500)
    return new ProviderError("unavailable", `${what}: the provider answered ${status}.`, status);
  return new ProviderError("refused", `${what}: the provider answered ${status}.`, status);
}

/** The provider's authorize URL for this attempt. */
export function authorizeUrl(
  config: ProviderConfig,
  input: { redirectUri: string; state: string; challenge: string; scopes: readonly string[] },
): string {
  const { id } = credentials(config);
  const url = new URL(config.definition.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", id);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

function parseScopes(raw: unknown, requested: readonly string[]): string[] {
  // RFC 6749 uses spaces; GitHub uses commas. No scope field means "as requested".
  if (typeof raw !== "string") return [...requested];
  return raw.split(/[\s,]+/).filter(Boolean);
}

async function tokenRequest(
  config: ProviderConfig,
  params: Record<string, string>,
  requested: readonly string[],
  what: string,
): Promise<TokenSet> {
  const { id, secret } = credentials(config);
  const res = await send(
    config.definition.tokenUrl,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "OriginOS-Connect",
      },
      body: new URLSearchParams({ ...params, client_id: id, client_secret: secret }).toString(),
    },
    what,
  );
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  // GitHub reports token errors with HTTP 200 and an `error` field.
  const error = typeof body?.error === "string" ? body.error : null;
  if (
    error === "invalid_grant" ||
    error === "bad_verification_code" ||
    error === "bad_refresh_token"
  )
    throw new ProviderError(
      "invalid_grant",
      `${what}: the provider rejected the grant.`,
      res.status,
    );
  if (!res.ok) throw statusError(res.status, what);
  if (error)
    throw new ProviderError(
      "refused",
      `${what}: the provider answered "${SAFE_ERROR.test(error) ? error : "error"}".`,
      res.status,
    );
  const accessToken = body?.access_token;
  if (typeof accessToken !== "string" || accessToken.length === 0)
    throw new ProviderError(
      "bad_response",
      `${what}: no access token in the response.`,
      res.status,
    );
  const refreshToken = typeof body?.refresh_token === "string" ? body.refresh_token : null;
  const expiresIn =
    typeof body?.expires_in === "number" ? body.expires_in : Number(body?.expires_in);
  return {
    accessToken,
    refreshToken,
    expiresAt:
      Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null,
    scopes: parseScopes(body?.scope, requested),
  };
}

export function exchangeCode(
  config: ProviderConfig,
  input: { code: string; redirectUri: string; verifier: string; scopes: readonly string[] },
): Promise<TokenSet> {
  return tokenRequest(
    config,
    {
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.verifier,
    },
    input.scopes,
    "Code exchange",
  );
}

export function refreshTokens(
  config: ProviderConfig,
  refreshToken: string,
  scopes: readonly string[],
): Promise<TokenSet> {
  return tokenRequest(
    config,
    { grant_type: "refresh_token", refresh_token: refreshToken },
    scopes,
    "Token refresh",
  );
}

/** Revoke the grant at the provider. An already revoked grant counts as success. */
export async function revokeGrant(config: ProviderConfig, accessToken: string): Promise<void> {
  const { id, secret } = credentials(config);
  const basic = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  const { style, url } = config.definition.revoke;
  const res =
    style === "github-grant"
      ? await send(
          url.replace("{client_id}", encodeURIComponent(id)),
          {
            method: "DELETE",
            headers: {
              ...config.definition.apiHeaders,
              authorization: basic,
              "content-type": "application/json",
            },
            body: JSON.stringify({ access_token: accessToken }),
          },
          "Revocation",
        )
      : await send(
          url,
          {
            method: "POST",
            headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              token: accessToken,
              token_type_hint: "access_token",
            }).toString(),
          },
          "Revocation",
        );
  await res.body?.cancel();
  // GitHub answers 404/422 for a grant that no longer exists.
  if (res.ok || res.status === 404 || res.status === 422) return;
  throw statusError(res.status, "Revocation");
}

export interface ProviderRequest {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** A path under the provider's API base, starting with "/". */
  readonly path: string;
  readonly body?: unknown;
  /** Sent as Idempotency-Key so a retried call is not applied twice by providers that honour it. */
  readonly idempotencyKey?: string;
}

export interface ProviderResponse {
  readonly status: number;
  readonly body: unknown;
}

/** One API call with the given access token. Throws ProviderError for non-2xx answers. */
export async function callProvider(
  config: ProviderConfig,
  accessToken: string,
  request: ProviderRequest,
): Promise<ProviderResponse> {
  if (!/^\/(?!\/)[^\s]*$/.test(request.path))
    throw new ProviderError("refused", "Provider paths must be relative to the provider's API.");
  const base = new URL(config.definition.apiBaseUrl);
  const url = new URL(base.pathname.replace(/\/$/, "") + request.path, base.origin);
  if (url.origin !== base.origin)
    throw new ProviderError("refused", "Provider paths must stay on the provider's API.");
  const res = await send(
    url.toString(),
    {
      method: request.method,
      headers: {
        ...config.definition.apiHeaders,
        authorization: `Bearer ${accessToken}`,
        ...(request.body === undefined ? {} : { "content-type": "application/json" }),
        ...(request.idempotencyKey ? { "idempotency-key": request.idempotencyKey } : {}),
      },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    },
    `${config.definition.name} API`,
  );
  if (!res.ok) {
    await res.body?.cancel();
    throw statusError(res.status, `${config.definition.name} API`);
  }
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ProviderError(
        "bad_response",
        `${config.definition.name} API: the answer was not JSON.`,
        res.status,
      );
    }
  }
  return { status: res.status, body };
}

export async function fetchIdentity(
  config: ProviderConfig,
  accessToken: string,
): Promise<AccountIdentity> {
  const res = await callProvider(config, accessToken, {
    method: "GET",
    path: config.definition.identityPath,
  });
  const identity = config.definition.parseIdentity(res.body);
  if (!identity)
    throw new ProviderError("bad_response", "The provider did not say which account this is.");
  return identity;
}
