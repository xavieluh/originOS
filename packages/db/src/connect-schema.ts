// Origin Connect (Phase 08, ADR-027): provider connections, single-use OAuth
// attempts and received webhook deliveries. Plumbing records in `core`.
import { CONNECTION_STATUSES, newConnectionId, newWebhookDeliveryId } from "@originos/contracts";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { core, organizations, users } from "./schema.js";

const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * One row per connected provider account. Tokens are sealed (envelope
 * encryption, see @originos/connect) and the application role cannot read the
 * sealed columns at all: only the worker, which makes provider calls, can.
 */
export const integrationConnections = core.table(
  "integration_connections",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newConnectionId()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    status: text("status", { enum: CONNECTION_STATUSES }).notNull().default("connected"),
    accountId: text("account_id").notNull(),
    accountLabel: text("account_label").notNull(),
    grantedScopes: text("granted_scopes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    accessTokenSealed: text("access_token_sealed"),
    refreshTokenSealed: text("refresh_token_sealed"),
    /** The key the sealed tokens are wrapped with, for rotation sweeps. */
    tokenKeyId: text("token_key_id"),
    tokenExpiresAt: ts("token_expires_at"),
    connectedByUserId: uuid("connected_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastCheckedAt: ts("last_checked_at"),
    /** A short, token-free reason (e.g. "the provider refused the token"). */
    lastError: text("last_error"),
    revokedAt: ts("revoked_at"),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("integration_connections_id_ck", sql`${t.id} ~ '^con_[0-9a-hjkmnp-tv-z]{26}$'`),
    check("integration_connections_provider_ck", sql`${t.provider} ~ '^[a-z][a-z0-9-]{1,39}$'`),
    check(
      "integration_connections_status_ck",
      sql`${t.status} in ('connected', 'degraded', 'revoked')`,
    ),
    check(
      "integration_connections_revoked_ck",
      sql`(${t.status} = 'revoked') = (${t.revokedAt} is not null)`,
    ),
    // A live connection always has a token to use.
    check(
      "integration_connections_token_ck",
      sql`${t.status} = 'revoked' or ${t.accessTokenSealed} is not null`,
    ),
    uniqueIndex("integration_connections_account_uq")
      .on(t.tenantId, t.provider, t.accountId)
      .where(sql`${t.revokedAt} is null`),
    index("integration_connections_tenant_idx").on(t.tenantId, t.createdAt),
  ],
);

/**
 * One row per authorization attempt, keyed by the SHA-256 of the state value
 * sent to the provider. Single use, bound to the person and organization that
 * started it, and expired after ten minutes (the life of a GitHub code).
 */
export const oauthStates = core.table(
  "oauth_states",
  {
    stateHash: text("state_hash").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    /** PKCE verifier. Useless without the single-use code and the client secret. */
    codeVerifier: text("code_verifier").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    scopes: text("scopes").array().notNull(),
    expiresAt: ts("expires_at").notNull(),
    consumedAt: ts("consumed_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("oauth_states_hash_ck", sql`${t.stateHash} ~ '^[0-9a-f]{64}$'`),
    index("oauth_states_expires_idx").on(t.expiresAt),
  ],
);

/**
 * Verified inbound webhook deliveries. (provider, delivery_id) is unique, so
 * a provider's retry or a replayed request is recorded once. Inserted only
 * through core.accept_webhook(), which also appends the outbox event.
 */
export const webhookDeliveries = core.table(
  "webhook_deliveries",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newWebhookDeliveryId()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => integrationConnections.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    deliveryId: text("delivery_id").notNull(),
    event: text("event").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    payloadSha256: text("payload_sha256").notNull(),
    byteSize: integer("byte_size").notNull(),
    correlationId: text("correlation_id"),
    receivedAt: ts("received_at").notNull().defaultNow(),
  },
  (t) => [
    check("webhook_deliveries_id_ck", sql`${t.id} ~ '^whd_[0-9a-hjkmnp-tv-z]{26}$'`),
    check("webhook_deliveries_sha256_ck", sql`${t.payloadSha256} ~ '^[0-9a-f]{64}$'`),
    uniqueIndex("webhook_deliveries_delivery_uq").on(t.provider, t.deliveryId),
    index("webhook_deliveries_connection_idx").on(t.connectionId, t.receivedAt),
  ],
);
