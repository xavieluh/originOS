// Origin Connect settings shared by the API and the worker (Phase 08).
import { type EnvSource, envFields, parseEnv } from "@originos/config";
import { z } from "zod";
import { type Keyring, parseKeyring } from "./keys.js";
import { type ProviderConfig, githubDefinition, testProviderDefinition } from "./providers.js";

const optional = z.string().min(1).optional();

const ConnectEnv = z
  .object({
    NODE_ENV: envFields.nodeEnv,
    /** `kid:base64key,...` (32-byte keys). Without it, no provider can be connected. */
    CONNECT_TOKEN_KEYS: optional,
    CONNECT_TOKEN_ACTIVE_KEY: optional,
    GITHUB_OAUTH_CLIENT_ID: optional,
    GITHUB_OAUTH_CLIENT_SECRET: optional,
    GITHUB_WEBHOOK_SECRET: optional,
    /** Base URL of the local fake provider. Refused in production. */
    CONNECT_TEST_PROVIDER_URL: envFields.url.optional(),
    CONNECT_TEST_PROVIDER_CLIENT_ID: z.string().min(1).default("originos-local"),
    CONNECT_TEST_PROVIDER_CLIENT_SECRET: optional,
    CONNECT_TEST_PROVIDER_WEBHOOK_SECRET: optional,
  })
  .refine((e) => e.NODE_ENV !== "production" || e.CONNECT_TEST_PROVIDER_URL === undefined, {
    path: ["CONNECT_TEST_PROVIDER_URL"],
    message: "is for local testing and cannot be set when NODE_ENV=production",
  })
  .refine(
    (e) =>
      (e.GITHUB_OAUTH_CLIENT_ID === undefined) === (e.GITHUB_OAUTH_CLIENT_SECRET === undefined),
    {
      path: ["GITHUB_OAUTH_CLIENT_SECRET"],
      message: "GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET are set together",
    },
  );

export interface Connect {
  /** Null when CONNECT_TOKEN_KEYS is not set: tokens cannot be stored, so nothing can connect. */
  readonly keyring: Keyring | null;
  readonly providers: readonly ProviderConfig[];
}

export function connectFromEnv(source: EnvSource = process.env): Connect {
  const env = parseEnv("connect", ConnectEnv, source);
  const keyring = env.CONNECT_TOKEN_KEYS
    ? parseKeyring(env.CONNECT_TOKEN_KEYS, env.CONNECT_TOKEN_ACTIVE_KEY)
    : null;
  const providers: ProviderConfig[] = [
    {
      definition: githubDefinition,
      clientId: env.GITHUB_OAUTH_CLIENT_ID ?? null,
      clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET ?? null,
      webhookSecret: env.GITHUB_WEBHOOK_SECRET ?? null,
      missing: env.GITHUB_OAUTH_CLIENT_ID
        ? []
        : ["GITHUB_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_SECRET"],
    },
  ];
  if (env.CONNECT_TEST_PROVIDER_URL) {
    providers.push({
      definition: testProviderDefinition(env.CONNECT_TEST_PROVIDER_URL),
      clientId: env.CONNECT_TEST_PROVIDER_CLIENT_ID,
      clientSecret: env.CONNECT_TEST_PROVIDER_CLIENT_SECRET ?? null,
      webhookSecret: env.CONNECT_TEST_PROVIDER_WEBHOOK_SECRET ?? null,
      missing: env.CONNECT_TEST_PROVIDER_CLIENT_SECRET
        ? []
        : ["CONNECT_TEST_PROVIDER_CLIENT_SECRET"],
    });
  }
  return { keyring, providers };
}

export const NO_CONNECT: Connect = { keyring: null, providers: [] };

export function findProvider(connect: Connect, id: string): ProviderConfig | undefined {
  return connect.providers.find((p) => p.definition.id === id);
}

/** True when the provider has credentials and tokens can be sealed. */
export function usable(connect: Connect, config: ProviderConfig): boolean {
  return connect.keyring !== null && config.missing.length === 0;
}
