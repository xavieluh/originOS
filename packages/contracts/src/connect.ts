// Origin Connect contracts (Phase 08, ADR-009 and ADR-027): the provider
// registry the UI shows, connection records and their truthful statuses.
// Tokens never appear in any of these shapes.

import { z } from "zod";

/** Provider ids are stable lowercase slugs used in URLs and stored rows. */
export const ProviderId = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/);
export type ProviderId = z.infer<typeof ProviderId>;

/**
 * not_configured: this deployment has no credentials for the provider (shown on providers, not rows).
 * connected: the stored grant worked the last time it was used or checked.
 * degraded: the provider refused the stored grant or kept failing; reconnect to fix.
 * revoked: disconnected by a person (or the grant was revoked); no new calls are made.
 */
export const CONNECTION_STATUSES = ["connected", "degraded", "revoked"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const ProviderScope = z.object({
  scope: z.string(),
  /** What the scope lets OriginOS do, in plain words, shown before connecting. */
  disclosure: z.string(),
});
export type ProviderScope = z.infer<typeof ProviderScope>;

export const ProviderView = z.object({
  id: ProviderId,
  name: z.string(),
  description: z.string(),
  /** True only for the local test provider: never a real service. */
  testOnly: z.boolean(),
  configured: z.boolean(),
  /** Why it is not configured, naming settings only, never values. */
  setupHint: z.string().nullable(),
  capabilities: z.array(z.string()),
  scopes: z.array(ProviderScope),
  /** Where the provider holds data, and what OriginOS keeps. */
  dataResidency: z.string(),
  stored: z.string(),
  webhooks: z.boolean(),
});
export type ProviderView = z.infer<typeof ProviderView>;

export const ConnectionView = z.object({
  id: z.string().regex(/^con_[0-9a-hjkmnp-tv-z]{26}$/),
  provider: ProviderId,
  status: z.enum(CONNECTION_STATUSES),
  accountLabel: z.string().nullable(),
  grantedScopes: z.array(z.string()),
  connectedBy: z.object({ userId: z.string().nullable(), name: z.string().nullable() }),
  lastCheckedAt: z.iso.datetime({ offset: true }).nullable(),
  lastError: z.string().nullable(),
  /** Inbound webhook URL for this connection (no secret in it). */
  webhookUrl: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  revokedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type ConnectionView = z.infer<typeof ConnectionView>;

export const ConnectCallback = z.object({
  provider: ProviderId,
  code: z.string().min(1).max(2048),
  state: z.string().min(1).max(256),
});
export type ConnectCallback = z.infer<typeof ConnectCallback>;

/** A verified inbound webhook delivery, as owners and admins see it (no payload). */
export const WebhookDeliveryView = z.object({
  id: z.string().regex(/^whd_[0-9a-hjkmnp-tv-z]{26}$/),
  event: z.string(),
  deliveryId: z.string(),
  byteSize: z.number().int(),
  receivedAt: z.iso.datetime({ offset: true }),
});
export type WebhookDeliveryView = z.infer<typeof WebhookDeliveryView>;

/** Job types Origin Connect enqueues (the worker runs them). */
export const CONNECT_CHECK_JOB = "connect.check";
export const CONNECT_REVOKE_JOB = "connect.revoke";
