// Inbound webhook verification (Phase 08, ADR-027). Signatures are checked
// over the exact raw bytes received, with constant-time comparison.
//
// github-hmac-sha256: `X-Hub-Signature-256: sha256=<hex>` over the body;
//   GitHub sends no timestamp, so replay defense is the delivery id
//   (`X-GitHub-Delivery`), stored once per provider.
// originos-hmac-sha256 (the test provider, and the scheme OriginOS uses for
//   its own outbound webhooks later): `X-OriginOS-Signature: t=<unix>,v1=<hex>`
//   over `<t>.<body>`, accepted within five minutes, plus the delivery id.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ProviderConfig, WebhookScheme } from "./providers.js";

export const WEBHOOK_TOLERANCE_SECONDS = 300;
export const WEBHOOK_MAX_BYTES = 256 * 1024;

export type WebhookRejection =
  "not_configured" | "missing_signature" | "bad_signature" | "stale" | "missing_delivery_id";

export type WebhookCheck =
  | { readonly ok: true; readonly deliveryId: string; readonly event: string }
  | { readonly ok: false; readonly reason: WebhookRejection };

type Headers = Readonly<Record<string, string | string[] | undefined>>;

const header = (headers: Headers, name: string): string | undefined => {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : v;
};

const hmacHex = (secret: string, data: Buffer) =>
  createHmac("sha256", secret).update(data).digest("hex");

function equalHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(a) || !/^[0-9a-f]{64}$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

const DELIVERY_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const EVENT = /^[a-z][a-z0-9_.-]{0,63}$/;

const NAMES: Record<WebhookScheme, { delivery: string; event: string }> = {
  "github-hmac-sha256": { delivery: "x-github-delivery", event: "x-github-event" },
  "originos-hmac-sha256": { delivery: "x-originos-delivery", event: "x-originos-event" },
};

/** Verify a delivery. `headers` must have lowercase names (Node and Fastify do this). */
export function verifyWebhook(
  config: ProviderConfig,
  headers: Headers,
  rawBody: Buffer,
  nowSeconds = Math.floor(Date.now() / 1000),
): WebhookCheck {
  const scheme = config.definition.webhookScheme;
  const secret = config.webhookSecret;
  if (!scheme || !secret) return { ok: false, reason: "not_configured" };

  if (scheme === "github-hmac-sha256") {
    const sig = header(headers, "x-hub-signature-256");
    if (!sig?.startsWith("sha256=")) return { ok: false, reason: "missing_signature" };
    if (!equalHex(sig.slice(7), hmacHex(secret, rawBody)))
      return { ok: false, reason: "bad_signature" };
  } else {
    const sig = header(headers, "x-originos-signature");
    const parts = Object.fromEntries(
      (sig ?? "").split(",").map((p) => p.trim().split("=", 2) as [string, string]),
    );
    const t = Number(parts.t);
    if (!sig || !Number.isInteger(t) || !parts.v1)
      return { ok: false, reason: "missing_signature" };
    const expected = hmacHex(secret, Buffer.concat([Buffer.from(`${t}.`), rawBody]));
    if (!equalHex(parts.v1, expected)) return { ok: false, reason: "bad_signature" };
    if (Math.abs(nowSeconds - t) > WEBHOOK_TOLERANCE_SECONDS) return { ok: false, reason: "stale" };
  }

  const deliveryId = header(headers, NAMES[scheme].delivery);
  if (!deliveryId || !DELIVERY_ID.test(deliveryId))
    return { ok: false, reason: "missing_delivery_id" };
  const rawEvent = header(headers, NAMES[scheme].event) ?? "unknown";
  return { ok: true, deliveryId, event: EVENT.test(rawEvent) ? rawEvent : "unknown" };
}

/** `X-OriginOS-Signature` value for a body (the test provider and tests use it). */
export function signOriginosWebhook(
  secret: string,
  rawBody: Buffer | string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const body = typeof rawBody === "string" ? Buffer.from(rawBody) : rawBody;
  return `t=${timestamp},v1=${hmacHex(secret, Buffer.concat([Buffer.from(`${timestamp}.`), body]))}`;
}

/** `X-Hub-Signature-256` value for a body, as GitHub computes it. */
export function signGithubWebhook(secret: string, rawBody: Buffer | string): string {
  return `sha256=${hmacHex(secret, typeof rawBody === "string" ? Buffer.from(rawBody) : rawBody)}`;
}
