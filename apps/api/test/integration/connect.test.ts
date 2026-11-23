// Phase 08 acceptance (API side): OAuth state and replay defense, tokens never
// in responses or logs, disconnect stops new calls, and webhook signatures,
// replays and retries. Runs against the fake provider (test-only) and a real
// PostgreSQL.
import {
  type Connect,
  generateKeySpec,
  open,
  parseKeyring,
  signOriginosWebhook,
  testProviderDefinition,
  tokenContext,
} from "@originos/connect";
import { FAKE_TOKEN_PREFIX, type FakeProvider, startFakeProvider } from "@originos/connect/testing";
import { schema } from "@originos/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, type Harness, invitationToken, startHarness, uniqueEmail } from "./helpers.js";

let h: Harness;
let fake: FakeProvider;
const logs: string[] = [];
const keyring = parseKeyring(generateKeySpec("k1"));
const WEBHOOK_SECRET = "whsec-test-only";
const PROVIDER = "test-provider";

beforeAll(async () => {
  fake = await startFakeProvider({
    clientId: "originos-test",
    clientSecret: "client-secret-test-only",
  });
  const connect: Connect = {
    keyring,
    providers: [
      {
        definition: testProviderDefinition(fake.url),
        clientId: "originos-test",
        clientSecret: "client-secret-test-only",
        webhookSecret: WEBHOOK_SECRET,
        missing: [],
      },
    ],
  };
  h = await startHarness({
    connect,
    webhookBaseUrl: "https://hooks.example.test",
    logLevel: "debug",
    logDestination: { write: (line) => void logs.push(line) },
  });
});
afterAll(async () => {
  await h?.close();
  await fake?.close();
});
beforeEach(() => fake.reset());

type Json = Record<string, unknown>;
const json = (r: { body: string }) => JSON.parse(r.body) as Json;

async function org(): Promise<Client> {
  const owner = await new Client(h).signUp(uniqueEmail("owner"));
  const res = await owner.request("POST", "/v1/organizations", { name: "Connect Lab" });
  if (res.statusCode !== 201) throw new Error(`org failed: ${res.body}`);
  return owner;
}

async function join(owner: Client, role: "admin" | "member"): Promise<Client> {
  const email = uniqueEmail(role);
  const res = await owner.request("POST", "/v1/organization/invitations", { email, role });
  if (res.statusCode !== 201) throw new Error(`invite failed: ${res.body}`);
  const c = await new Client(h).signUp(email);
  const accepted = await c.request("POST", "/v1/invitations/accept", {
    token: invitationToken(h.mailer, email),
  });
  if (accepted.statusCode !== 200) throw new Error(`accept failed: ${accepted.body}`);
  return c;
}

/** Start, approve at the fake provider, and return the callback parameters. */
async function authorize(
  c: Client,
): Promise<{ code: string; state: string; authorizeUrl: string }> {
  const start = await c.request("POST", `/v1/organization/connections/${PROVIDER}/start`, {});
  expect(start.statusCode, start.body).toBe(200);
  const authorizeUrl = String(json(start).authorizeUrl);
  const back = new URL(fake.approve(authorizeUrl));
  return {
    code: back.searchParams.get("code")!,
    state: back.searchParams.get("state")!,
    authorizeUrl,
  };
}

const callback = (c: Client, p: { code: string; state: string }) =>
  c.request("POST", "/v1/connect/callback", { provider: PROVIDER, code: p.code, state: p.state });

async function connected(c: Client): Promise<Json> {
  const res = await callback(c, await authorize(c));
  expect(res.statusCode, res.body).toBe(200);
  return json(res);
}

describe("provider registry", () => {
  it("lists providers with disclosures and truthful setup states", async () => {
    const owner = await org();
    const res = await owner.request("GET", "/v1/connect/providers");
    expect(res.statusCode).toBe(200);
    const list = JSON.parse(res.body) as Json[];
    expect(list.map((p) => p.id)).toEqual([PROVIDER]);
    expect(list[0]).toMatchObject({ testOnly: true, configured: true, webhooks: true });
    expect((list[0]!.scopes as Json[])[0]).toMatchObject({ scope: "profile" });
    expect(res.body).not.toContain("client-secret-test-only");
  });

  it("answers not set up for a provider without credentials", async () => {
    const bare = await startHarness();
    try {
      const owner = await new Client(bare).signUp(uniqueEmail("bare"));
      await owner.request("POST", "/v1/organizations", { name: "Bare" });
      const list = JSON.parse((await owner.request("GET", "/v1/connect/providers")).body) as Json[];
      expect(list).toEqual([expect.objectContaining({ id: "github", configured: false })]);
      expect(String(list[0]!.setupHint)).toContain("GITHUB_OAUTH_CLIENT_ID");
      const start = await owner.request("POST", "/v1/organization/connections/github/start", {});
      expect(start.statusCode).toBe(503);
      expect(json(start).error).toBe("provider_not_configured");
    } finally {
      await bare.close();
    }
  });
});

describe("OAuth state and replay", () => {
  it("sends PKCE (S256) and a state, and connects once", async () => {
    const owner = await org();
    const p = await authorize(owner);
    const url = new URL(p.authorizeUrl);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/integrations/callback/test-provider",
    );
    const res = await callback(owner, p);
    expect(res.statusCode, res.body).toBe(200);
    expect(json(res)).toMatchObject({
      provider: PROVIDER,
      status: "connected",
      accountLabel: "test-user",
      grantedScopes: ["profile", "echo"],
    });
    expect(String(json(res).webhookUrl)).toMatch(
      /^https:\/\/hooks\.example\.test\/v1\/webhooks\/test-provider\/con_/,
    );

    const replay = await callback(owner, p);
    expect(replay.statusCode).toBe(400);
    expect(json(replay).error).toBe("state_used");
    expect(fake.state().tokenRequests).toBe(1);
  });

  it("refuses an unknown state, another person's state, and another organization's", async () => {
    const owner = await org();
    const admin = await join(owner, "admin");
    const p = await authorize(owner);
    const forged = await callback(owner, { code: p.code, state: "not-a-real-state-value" });
    expect(json(forged).error).toBe("invalid_state");
    const stolen = await callback(admin, p);
    expect(stolen.statusCode).toBe(400);
    expect(json(stolen).error).toBe("invalid_state");
    const other = await org();
    expect(json(await callback(other, p)).error).toBe("invalid_state");
    // None of those reached the provider, and the owner can still finish.
    expect(fake.state().tokenRequests).toBe(0);
    expect((await callback(owner, p)).statusCode).toBe(200);
  });

  it("refuses an expired state", async () => {
    const owner = await org();
    const p = await authorize(owner);
    await h.owner.db.update(schema.oauthStates).set({ expiresAt: new Date(Date.now() - 1000) });
    const res = await callback(owner, p);
    expect(json(res).error).toBe("state_expired");
    expect(fake.state().tokenRequests).toBe(0);
  });

  it("reports a code the provider rejects, and a state for a different provider", async () => {
    const owner = await org();
    const p = await authorize(owner);
    const wrongProvider = await owner.request("POST", "/v1/connect/callback", {
      provider: "github",
      code: p.code,
      state: p.state,
    });
    expect(wrongProvider.statusCode).toBe(404); // this harness lists only the test provider
    const bad = await callback(owner, { code: "code_not-issued", state: p.state });
    expect(bad.statusCode).toBe(400);
    expect(json(bad).error).toBe("provider_rejected_code");
  });

  it("lets only owners and admins connect; members can see connections", async () => {
    const owner = await org();
    const member = await join(owner, "member");
    const start = await member.request(
      "POST",
      `/v1/organization/connections/${PROVIDER}/start`,
      {},
    );
    expect(start.statusCode).toBe(403);
    await connected(owner);
    const list = await member.request("GET", "/v1/organization/connections");
    expect(list.statusCode).toBe(200);
    expect(JSON.parse(list.body)).toHaveLength(1);
    const other = await org();
    expect(JSON.parse((await other.request("GET", "/v1/organization/connections")).body)).toEqual(
      [],
    );
  });

  it("reconnecting the same account updates the existing connection", async () => {
    const owner = await org();
    const first = await connected(owner);
    const second = await connected(owner);
    expect(second.id).toBe(first.id);
    expect(
      JSON.parse((await owner.request("GET", "/v1/organization/connections")).body),
    ).toHaveLength(1);
  });
});

describe("tokens never reach the client or the logs", () => {
  it("stores tokens sealed and keeps them out of every response and log line", async () => {
    const owner = await org();
    const view = await connected(owner);
    const bodies = [
      JSON.stringify(view),
      (await owner.request("GET", "/v1/organization/connections")).body,
      (await owner.request("POST", `/v1/organization/connections/${String(view.id)}/check`, {}))
        .body,
      (await owner.request("GET", `/v1/organization/connections/${String(view.id)}/deliveries`))
        .body,
    ];
    for (const body of bodies) {
      expect(body).not.toContain(FAKE_TOKEN_PREFIX);
      expect(body).not.toMatch(/sealed|refresh_token|access_token/i);
    }
    const [row] = await h.owner.db
      .select()
      .from(schema.integrationConnections)
      .where(eq(schema.integrationConnections.id, String(view.id)));
    expect(row?.accessTokenSealed).toMatch(/^v1~k1~/);
    expect(row?.accessTokenSealed).not.toContain(FAKE_TOKEN_PREFIX);
    const token = open(
      keyring,
      row!.accessTokenSealed!,
      tokenContext(row!.tenantId, row!.id, "access"),
    );
    expect(token.startsWith(FAKE_TOKEN_PREFIX)).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.join("\n")).not.toContain(FAKE_TOKEN_PREFIX);
    expect(logs.join("\n")).not.toContain(token);
    expect(logs.join("\n")).not.toContain("client-secret-test-only");
  });
});

describe("disconnect", () => {
  it("marks the connection revoked at once, queues revocation, and refuses checks", async () => {
    const owner = await org();
    const view = await connected(owner);
    const id = String(view.id);
    const res = await owner.request("POST", `/v1/organization/connections/${id}/disconnect`, {});
    expect(res.statusCode).toBe(200);
    expect(json(res)).toMatchObject({ status: "revoked", webhookUrl: null });
    const jobs = await h.owner.db.select().from(schema.jobs).where(eq(schema.jobs.subjectRef, id));
    expect(jobs.map((j) => j.type)).toContain("connect.revoke");
    const check = await owner.request("POST", `/v1/organization/connections/${id}/check`, {});
    expect(check.statusCode).toBe(409);
    expect(json(check).error).toBe("connection_revoked");
    // Idempotent.
    expect(
      (await owner.request("POST", `/v1/organization/connections/${id}/disconnect`, {})).statusCode,
    ).toBe(200);
    const audit = await h.owner.db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.targetId, id));
    expect(audit.map((a) => a.action).sort()).toEqual([
      "integration.connected",
      "integration.disconnected",
    ]);
  });
});

describe("inbound webhooks", () => {
  const send = (path: string, raw: string, headers: Record<string, string>) =>
    h.app.inject({
      method: "POST",
      url: path,
      headers: { "content-type": "application/json", ...headers },
      payload: raw,
    });

  async function setup() {
    const owner = await org();
    const view = await connected(owner);
    return { owner, id: String(view.id), path: `/v1/webhooks/${PROVIDER}/${String(view.id)}` };
  }

  const signed = (raw: string, deliveryId: string, t?: number) => ({
    "x-originos-signature": signOriginosWebhook(WEBHOOK_SECRET, raw, t),
    "x-originos-delivery": deliveryId,
    "x-originos-event": "test.ping",
  });

  it("accepts a signed delivery once; retries and replays are duplicates", async () => {
    const { owner, id, path } = await setup();
    const raw = JSON.stringify({ hello: "world" });
    const first = await send(path, raw, signed(raw, `d-${id}`));
    expect(first.statusCode, first.body).toBe(200);
    expect(json(first).status).toBe("accepted");
    const retry = await send(path, raw, signed(raw, `d-${id}`));
    expect(json(retry).status).toBe("duplicate");
    const deliveries = JSON.parse(
      (await owner.request("GET", `/v1/organization/connections/${id}/deliveries`)).body,
    ) as Json[];
    expect(deliveries).toEqual([
      expect.objectContaining({ event: "test.ping", deliveryId: `d-${id}` }),
    ]);
    const events = await h.owner.db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.type, "integration.webhook_received"));
    expect(events.filter((e) => (e.payload as Json).connectionId === id)).toHaveLength(1);
  });

  it("verifies the exact raw bytes", async () => {
    const { id, path } = await setup();
    const raw = '{"a": 1,  "b":2}';
    expect((await send(path, raw, signed(raw, `raw-${id}`))).statusCode).toBe(200);
    const reformatted = JSON.stringify(JSON.parse(raw));
    const res = await send(path, reformatted, signed(raw, `raw2-${id}`));
    expect(res.statusCode).toBe(401);
    expect(json(res).error).toBe("bad_signature");
  });

  it("refuses unsigned, wrongly signed and stale deliveries without revealing the connection", async () => {
    const { id, path } = await setup();
    const raw = "{}";
    expect(json(await send(path, raw, { "x-originos-delivery": "x" })).error).toBe(
      "missing_signature",
    );
    const wrong = await send(path, raw, {
      "x-originos-signature": signOriginosWebhook("not-the-secret", raw),
      "x-originos-delivery": `w-${id}`,
    });
    expect(wrong.statusCode).toBe(401);
    const stale = await send(
      path,
      raw,
      signed(raw, `s-${id}`, Math.floor(Date.now() / 1000) - 600),
    );
    expect(json(stale).error).toBe("stale");
    // A forged request to a connection that does not exist gets the same 401, not a 404.
    const unknown = await send(`/v1/webhooks/${PROVIDER}/con_00000000000000000000000000`, raw, {
      "x-originos-delivery": "u",
    });
    expect(unknown.statusCode).toBe(401);
    expect((await send(`/v1/webhooks/nope/${id}`, raw, signed(raw, "n"))).statusCode).toBe(404);
  });

  it("refuses deliveries for a disconnected connection", async () => {
    const { owner, id, path } = await setup();
    await owner.request("POST", `/v1/organization/connections/${id}/disconnect`, {});
    const raw = "{}";
    const res = await send(path, raw, signed(raw, `r-${id}`));
    expect(res.statusCode).toBe(410);
  });

  it("refuses non-JSON bodies and needs no session or origin", async () => {
    const { id, path } = await setup();
    const form = await h.app.inject({
      method: "POST",
      url: path,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "a=1",
    });
    expect(form.statusCode).toBe(415);
    const raw = "[1,2]";
    expect((await send(path, raw, signed(raw, `j-${id}`))).statusCode).toBe(200);
  });
});
