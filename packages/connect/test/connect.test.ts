import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type ProviderConfig,
  ProviderError,
  authorizeUrl,
  callProvider,
  connectFromEnv,
  createPkce,
  exchangeCode,
  fetchIdentity,
  generateKeySpec,
  hashState,
  open,
  parseKeyring,
  providerView,
  refreshTokens,
  revokeGrant,
  rewrap,
  s256,
  seal,
  sealedKeyId,
  signGithubWebhook,
  signOriginosWebhook,
  testProviderDefinition,
  verifyWebhook,
  githubDefinition,
} from "../src/index.js";
import { FAKE_TOKEN_PREFIX, type FakeProvider, startFakeProvider } from "../src/testing/index.js";

describe("envelope encryption", () => {
  const k1 = parseKeyring(generateKeySpec("k1"));

  it("round-trips and binds the context", () => {
    const sealed = seal(k1, "gho_secret", "t1|con_1|access");
    expect(sealed).not.toContain("gho_secret");
    expect(open(k1, sealed, "t1|con_1|access")).toBe("gho_secret");
    expect(() => open(k1, sealed, "t2|con_1|access")).toThrow(/did not verify/);
  });

  it("uses a fresh data key each time", () => {
    expect(seal(k1, "x", "c")).not.toBe(seal(k1, "x", "c"));
  });

  it("detects tampering", () => {
    const sealed = seal(k1, "token", "c");
    const parts = sealed.split("~");
    const payload = parts[3]!.split(".");
    payload[1] = Buffer.from("other").toString("base64url");
    parts[3] = payload.join(".");
    expect(() => open(k1, parts.join("~"), "c")).toThrow(/did not verify/);
  });

  it("rewraps under a new key without changing the token ciphertext", () => {
    const spec1 = generateKeySpec("k1");
    const old = parseKeyring(spec1);
    const sealed = seal(old, "token", "c");
    const both = parseKeyring(`${spec1},${generateKeySpec("k2")}`, "k2");
    const next = rewrap(both, sealed, "c");
    expect(sealedKeyId(next)).toBe("k2");
    expect(next.split("~")[3]).toBe(sealed.split("~")[3]);
    expect(open(both, next, "c")).toBe("token");
    expect(() => open(old, next, "c")).toThrow(/not in the keyring/);
    expect(rewrap(both, next, "c")).toBe(next);
  });

  it("validates key specs without echoing key material", () => {
    expect(() => parseKeyring("k1:c2hvcnQ=")).toThrow(/32 bytes/);
    expect(() => parseKeyring("")).toThrow(/No token keys/);
    expect(() => parseKeyring(generateKeySpec("k1"), "k9")).toThrow(/not listed/);
    try {
      parseKeyring("BAD KEY:abc");
    } catch (e) {
      expect(String(e)).not.toContain("abc");
    }
  });
});

describe("PKCE", () => {
  it("matches the RFC 7636 appendix B example", () => {
    expect(s256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
  it("creates verifiers in the allowed length", () => {
    const p = createPkce();
    expect(p.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.challenge).toBe(s256(p.verifier));
    expect(hashState("a")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("webhook signatures", () => {
  const github: ProviderConfig = {
    definition: githubDefinition,
    clientId: "id",
    clientSecret: "s",
    webhookSecret: "It's a Secret to Everybody",
    missing: [],
  };

  it("matches GitHub's documented test vector", () => {
    expect(signGithubWebhook("It's a Secret to Everybody", "Hello, World!")).toBe(
      "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
    );
    const body = Buffer.from("Hello, World!");
    expect(
      verifyWebhook(
        github,
        {
          "x-hub-signature-256": signGithubWebhook(github.webhookSecret!, body),
          "x-github-delivery": "72d3162e-cc78-11e3-81ab-4c9367dc0958",
          "x-github-event": "ping",
        },
        body,
      ),
    ).toEqual({ ok: true, deliveryId: "72d3162e-cc78-11e3-81ab-4c9367dc0958", event: "ping" });
  });

  it("rejects a wrong signature, a modified body and a missing delivery id", () => {
    const body = Buffer.from("{}");
    const sig = signGithubWebhook(github.webhookSecret!, body);
    expect(verifyWebhook(github, { "x-hub-signature-256": sig }, Buffer.from("{ }"))).toEqual({
      ok: false,
      reason: "bad_signature",
    });
    expect(verifyWebhook(github, {}, body)).toEqual({ ok: false, reason: "missing_signature" });
    expect(verifyWebhook(github, { "x-hub-signature-256": sig }, body)).toEqual({
      ok: false,
      reason: "missing_delivery_id",
    });
    expect(verifyWebhook({ ...github, webhookSecret: null }, {}, body)).toEqual({
      ok: false,
      reason: "not_configured",
    });
  });

  it("enforces the timestamp window for the OriginOS scheme", () => {
    const config: ProviderConfig = {
      definition: testProviderDefinition("http://127.0.0.1:1"),
      clientId: "id",
      clientSecret: "s",
      webhookSecret: "whsec",
      missing: [],
    };
    const body = Buffer.from('{"a":1}');
    const now = 1_800_000_000;
    const headers = (t: number) => ({
      "x-originos-signature": signOriginosWebhook("whsec", body, t),
      "x-originos-delivery": "d1",
      "x-originos-event": "test.ping",
    });
    expect(verifyWebhook(config, headers(now), body, now)).toMatchObject({
      ok: true,
      event: "test.ping",
    });
    expect(verifyWebhook(config, headers(now - 301), body, now)).toEqual({
      ok: false,
      reason: "stale",
    });
    expect(verifyWebhook(config, headers(now), Buffer.from('{"a":2}'), now)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });
});

describe("environment", () => {
  it("reports missing settings by name and hides the test provider unless configured", () => {
    const c = connectFromEnv({ NODE_ENV: "test" });
    expect(c.keyring).toBeNull();
    expect(c.providers.map((p) => p.definition.id)).toEqual(["github"]);
    const view = providerView(c.providers[0]!, false);
    expect(view.configured).toBe(false);
    expect(view.setupHint).toContain("GITHUB_OAUTH_CLIENT_ID");
    expect(view.setupHint).toContain("CONNECT_TOKEN_KEYS");
  });

  it("refuses the test provider in production", () => {
    expect(() =>
      connectFromEnv({
        NODE_ENV: "production",
        CONNECT_TEST_PROVIDER_URL: "http://127.0.0.1:4995",
      }),
    ).toThrow(/CONNECT_TEST_PROVIDER_URL/);
  });

  it("never puts secret values in validation errors", () => {
    try {
      connectFromEnv({ NODE_ENV: "test", GITHUB_OAUTH_CLIENT_ID: "Iv1.visible-id" });
      expect.unreachable();
    } catch (e) {
      expect(String(e)).toContain("GITHUB_OAUTH_CLIENT_SECRET");
      expect(String(e)).not.toContain("visible-id");
    }
  });
});

describe("OAuth against the fake provider", () => {
  let fake: FakeProvider;
  let config: ProviderConfig;
  const redirectUri = "http://localhost:3000/integrations/callback/test-provider";

  beforeAll(async () => {
    fake = await startFakeProvider({ clientId: "client-1", clientSecret: "secret-1" });
    config = {
      definition: testProviderDefinition(fake.url),
      clientId: "client-1",
      clientSecret: "secret-1",
      webhookSecret: null,
      missing: [],
    };
  });
  beforeEach(() => fake.reset());
  afterAll(() => fake.close());

  const connect = async () => {
    const pkce = createPkce();
    const url = authorizeUrl(config, {
      redirectUri,
      state: "st",
      challenge: pkce.challenge,
      scopes: ["profile"],
    });
    const code = new URL(fake.approve(url)).searchParams.get("code")!;
    return { pkce, code };
  };

  it("exchanges a code with the right verifier, once", async () => {
    const { pkce, code } = await connect();
    const tokens = await exchangeCode(config, {
      code,
      redirectUri,
      verifier: pkce.verifier,
      scopes: ["profile"],
    });
    expect(tokens.accessToken.startsWith(FAKE_TOKEN_PREFIX)).toBe(true);
    expect(tokens.scopes).toEqual(["profile"]);
    expect(tokens.expiresAt).toBeInstanceOf(Date);
    expect(await fetchIdentity(config, tokens.accessToken)).toEqual({
      id: "tp-user-1",
      label: "test-user",
    });

    const replay = exchangeCode(config, { code, redirectUri, verifier: pkce.verifier, scopes: [] });
    await expect(replay).rejects.toMatchObject({ kind: "invalid_grant" });
    // The reused code revoked what it issued.
    await expect(fetchIdentity(config, tokens.accessToken)).rejects.toMatchObject({
      kind: "unauthorized",
    });
  });

  it("rejects a wrong verifier and a wrong redirect URI", async () => {
    const a = await connect();
    await expect(
      exchangeCode(config, {
        code: a.code,
        redirectUri,
        verifier: createPkce().verifier,
        scopes: [],
      }),
    ).rejects.toMatchObject({ kind: "invalid_grant" });
    const b = await connect();
    await expect(
      exchangeCode(config, {
        code: b.code,
        redirectUri: `${redirectUri}x`,
        verifier: b.pkce.verifier,
        scopes: [],
      }),
    ).rejects.toMatchObject({ kind: "invalid_grant" });
  });

  it("rotates refresh tokens and revokes", async () => {
    const { pkce, code } = await connect();
    const first = await exchangeCode(config, {
      code,
      redirectUri,
      verifier: pkce.verifier,
      scopes: ["profile"],
    });
    const second = await refreshTokens(config, first.refreshToken!, ["profile"]);
    await expect(refreshTokens(config, first.refreshToken!, [])).rejects.toMatchObject({
      kind: "invalid_grant",
    });
    await revokeGrant(config, second.accessToken);
    await expect(fetchIdentity(config, second.accessToken)).rejects.toMatchObject({
      kind: "unauthorized",
    });
    expect(fake.state().revocations).toBe(1);
  });

  it("classifies failures and keeps tokens out of error messages", async () => {
    const { pkce, code } = await connect();
    const t = await exchangeCode(config, {
      code,
      redirectUri,
      verifier: pkce.verifier,
      scopes: [],
    });
    fake.failNext(503);
    const err = await callProvider(config, t.accessToken, { method: "GET", path: "/api/me" }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(true);
    expect(String((err as Error).message)).not.toContain(FAKE_TOKEN_PREFIX);
    await expect(
      callProvider(config, t.accessToken, { method: "GET", path: "//evil.example/x" }),
    ).rejects.toMatchObject({ kind: "refused" });
    await expect(
      exchangeCode(
        { ...config, clientSecret: "wrong" },
        { code: "x", redirectUri, verifier: "v", scopes: [] },
      ),
    ).rejects.toMatchObject({ kind: "unauthorized" });
  });

  it("refuses an unreachable provider as unavailable", async () => {
    const down = { ...config, definition: testProviderDefinition("http://127.0.0.1:1") };
    await expect(fetchIdentity(down, "t")).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("counts idempotency keys on the echo endpoint", async () => {
    const { pkce, code } = await connect();
    const t = await exchangeCode(config, {
      code,
      redirectUri,
      verifier: pkce.verifier,
      scopes: [],
    });
    for (let i = 0; i < 2; i += 1)
      await callProvider(config, t.accessToken, {
        method: "POST",
        path: "/api/echo",
        body: { n: 1 },
        idempotencyKey: "k1",
      });
    expect(fake.state()).toMatchObject({ echoApplied: 1, echoKeys: { k1: 2 } });
  });
});
