// The provider registry (Phase 08, ADR-027): what each provider is, which
// scopes OriginOS asks for and why, where data lives, and whether this
// deployment has the credentials to use it. Definitions are code; credentials
// come from the environment and never leave the server.
import type { ProviderScope, ProviderView } from "@originos/contracts";

export type WebhookScheme = "github-hmac-sha256" | "originos-hmac-sha256";
export type RevokeStyle = "github-grant" | "rfc7009";

export interface AccountIdentity {
  readonly id: string;
  readonly label: string;
}

export interface ProviderDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Only the local test provider: never listed in production. */
  readonly testOnly: boolean;
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  /** Every API call is a path under this base; callers cannot name another host. */
  readonly apiBaseUrl: string;
  readonly revoke: { readonly style: RevokeStyle; readonly url: string };
  readonly scopes: readonly ProviderScope[];
  readonly capabilities: readonly string[];
  readonly dataResidency: string;
  readonly stored: string;
  readonly webhookScheme: WebhookScheme | null;
  readonly identityPath: string;
  readonly apiHeaders: Readonly<Record<string, string>>;
  parseIdentity(body: unknown): AccountIdentity | null;
}

export interface ProviderConfig {
  readonly definition: ProviderDefinition;
  readonly clientId: string | null;
  readonly clientSecret: string | null;
  readonly webhookSecret: string | null;
  /** Settings (names only) that are missing. Empty when the provider can be used. */
  readonly missing: readonly string[];
}

const STORED =
  "OriginOS keeps the connected account's id and name, the scopes you granted, and the access and refresh tokens encrypted at rest. Tokens are used only by OriginOS's server and are never shown in the browser.";

export const githubDefinition: ProviderDefinition = {
  id: "github",
  name: "GitHub",
  description: "Link a GitHub account to this organization.",
  testOnly: false,
  authorizeUrl: "https://github.com/login/oauth/authorize",
  tokenUrl: "https://github.com/login/oauth/access_token",
  apiBaseUrl: "https://api.github.com",
  revoke: { style: "github-grant", url: "https://api.github.com/applications/{client_id}/grant" },
  scopes: [
    {
      scope: "read:user",
      disclosure:
        "Read your GitHub profile (login, name and public profile details). No access to repositories, code or organizations.",
    },
  ],
  capabilities: [
    "Identify the connected GitHub account",
    "Check that the connection still works",
    "Receive webhooks signed with this deployment's GitHub webhook secret",
  ],
  dataResidency:
    "Your GitHub data stays with GitHub under GitHub's terms. Webhook deliveries that OriginOS receives are stored in this deployment's database.",
  stored: STORED,
  webhookScheme: "github-hmac-sha256",
  identityPath: "/user",
  apiHeaders: {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "OriginOS-Connect",
  },
  parseIdentity(body) {
    const b = body as { id?: unknown; login?: unknown } | null;
    if (!b || (typeof b.id !== "number" && typeof b.id !== "string") || typeof b.login !== "string")
      return null;
    return { id: String(b.id), label: b.login };
  },
};

/** The local test provider served by `@originos/connect/testing` (tests and local development only). */
export function testProviderDefinition(baseUrl: string): ProviderDefinition {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    id: "test-provider",
    name: "Test provider (local testing only)",
    description:
      "A fake OAuth provider that runs on this machine for tests and local development. It is not a real service and is refused in production.",
    testOnly: true,
    authorizeUrl: `${base}/oauth/authorize`,
    tokenUrl: `${base}/oauth/token`,
    apiBaseUrl: base,
    revoke: { style: "rfc7009", url: `${base}/oauth/revoke` },
    scopes: [
      { scope: "profile", disclosure: "Read the test account's id and name." },
      { scope: "echo", disclosure: "Send test messages that the test provider echoes back." },
    ],
    capabilities: [
      "Identify the test account",
      "Check the connection",
      "Receive signed test webhooks",
    ],
    dataResidency: "Everything stays on this machine; the test provider keeps its data in memory.",
    stored: STORED,
    webhookScheme: "originos-hmac-sha256",
    identityPath: "/api/me",
    apiHeaders: { accept: "application/json" },
    parseIdentity(body) {
      const b = body as { id?: unknown; login?: unknown } | null;
      if (!b || typeof b.id !== "string" || typeof b.login !== "string") return null;
      return { id: b.id, label: b.login };
    },
  };
}

export function providerView(config: ProviderConfig, tokenKeysConfigured: boolean): ProviderView {
  const missing = [...config.missing, ...(tokenKeysConfigured ? [] : ["CONNECT_TOKEN_KEYS"])];
  const d = config.definition;
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    testOnly: d.testOnly,
    configured: missing.length === 0,
    setupHint:
      missing.length === 0
        ? null
        : `An operator sets ${missing.join(", ")} for the API and the worker. See docs/DEVELOPMENT.md.`,
    capabilities: [...d.capabilities],
    scopes: [...d.scopes],
    dataResidency: d.dataResidency,
    stored: d.stored,
    webhooks: d.webhookScheme !== null && config.webhookSecret !== null,
  };
}
