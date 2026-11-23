// Origin Connect (Phase 08, ADR-027): the OAuth broker. Starts authorization
// with PKCE and a single-use state, exchanges the code on the server, stores
// tokens sealed, and hands every later provider call to the worker. The API
// role cannot read sealed tokens back (column grants, migration 0009).
import { createHash } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  CONNECT_CHECK_JOB,
  CONNECT_REVOKE_JOB,
  type ConnectCallback,
  type ConnectionView,
  type ProviderView,
  type WebhookDeliveryView,
  newConnectionId,
  newEventId,
  newWebhookDeliveryId,
} from "@originos/contracts";
import {
  type Connect,
  ProviderError,
  WEBHOOK_MAX_BYTES,
  authorizeUrl,
  exchangeCode,
  fetchIdentity,
  findProvider,
  providerView,
  seal,
  tokenContext,
  usable,
  verifyWebhook,
} from "@originos/connect";
import { type Db, enqueueJob, schema, withScope } from "@originos/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  APP_DB,
  ApiError,
  type Principal,
  type TenantContext,
  conflict,
  notFound,
  recordAudit,
} from "../core/index.js";
import { beginAttempt, consumeAttempt } from "./attempts.js";
import { CONNECT, CONNECT_PUBLIC_ORIGIN, WEBHOOK_BASE_URL } from "./tokens.js";

const { integrationConnections: conns, webhookDeliveries, users } = schema;

/** Columns the application role may read. Sealed tokens are not among them. */
const VIEW_COLUMNS = {
  id: conns.id,
  tenantId: conns.tenantId,
  provider: conns.provider,
  status: conns.status,
  accountId: conns.accountId,
  accountLabel: conns.accountLabel,
  grantedScopes: conns.grantedScopes,
  connectedByUserId: conns.connectedByUserId,
  lastCheckedAt: conns.lastCheckedAt,
  lastError: conns.lastError,
  createdAt: conns.createdAt,
  revokedAt: conns.revokedAt,
  connectedByName: users.name,
};
type ViewRow = {
  [K in keyof typeof VIEW_COLUMNS]: (typeof VIEW_COLUMNS)[K]["_"]["data"] | null;
};

const providerFailed = (error: ProviderError) =>
  new ApiError(
    error.kind === "unavailable" ? HttpStatus.BAD_GATEWAY : HttpStatus.BAD_REQUEST,
    error.kind === "invalid_grant" ? "provider_rejected_code" : "provider_error",
    error.kind === "invalid_grant"
      ? "The provider did not accept this authorization. Start connecting again."
      : `The provider could not complete the connection (${error.message}) Try again.`,
  );

export type WebhookOutcome =
  | { readonly status: 200; readonly body: { readonly status: "accepted" | "duplicate" } }
  | {
      readonly status: 400 | 401 | 404 | 410 | 413 | 415;
      readonly body: { error: string; message: string };
    };

@Injectable()
export class ConnectService {
  constructor(
    @Inject(APP_DB) private readonly db: Db | null,
    @Inject(CONNECT) private readonly connect: Connect,
    @Inject(CONNECT_PUBLIC_ORIGIN) private readonly publicOrigin: string,
    @Inject(WEBHOOK_BASE_URL) private readonly webhookBase: string | null,
  ) {}

  private get database(): Db {
    if (!this.db) throw new Error("ConnectService used without a database");
    return this.db;
  }

  providers(): ProviderView[] {
    return this.connect.providers.map((p) => providerView(p, this.connect.keyring !== null));
  }

  private toView(row: ViewRow): ConnectionView {
    const config = findProvider(this.connect, row.provider!);
    const webhooks = Boolean(config?.definition.webhookScheme && config.webhookSecret);
    return {
      id: row.id!,
      provider: row.provider!,
      status: row.status!,
      accountLabel: row.accountLabel,
      grantedScopes: row.grantedScopes ?? [],
      connectedBy: { userId: row.connectedByUserId, name: row.connectedByName },
      lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
      lastError: row.lastError,
      webhookUrl:
        webhooks && this.webhookBase && row.status !== "revoked"
          ? `${this.webhookBase}/v1/webhooks/${row.provider}/${row.id}`
          : null,
      createdAt: row.createdAt!.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
    };
  }

  private selectViews(tx: Parameters<Parameters<typeof withScope>[2]>[0]) {
    return tx
      .select(VIEW_COLUMNS)
      .from(conns)
      .leftJoin(users, eq(users.id, conns.connectedByUserId));
  }

  async list(p: Principal, t: TenantContext): Promise<ConnectionView[]> {
    const rows = await withScope(this.database, { userId: p.userId, tenantId: t.tenantId }, (tx) =>
      this.selectViews(tx)
        .where(eq(conns.tenantId, t.tenantId))
        .orderBy(sql`${conns.revokedAt} is not null`, desc(conns.createdAt))
        .limit(100),
    );
    return rows.map((r) => this.toView(r));
  }

  private async getView(p: Principal, t: TenantContext, id: string): Promise<ConnectionView> {
    const [row] = await withScope(this.database, { userId: p.userId, tenantId: t.tenantId }, (tx) =>
      this.selectViews(tx).where(eq(conns.id, id)),
    );
    if (!row || row.tenantId !== t.tenantId) throw notFound("No such connection.");
    return this.toView(row);
  }

  private usableProvider(providerId: string) {
    const config = findProvider(this.connect, providerId);
    if (!config) throw notFound("No such provider.");
    if (!usable(this.connect, config) || !this.connect.keyring)
      throw new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "provider_not_configured",
        `${config.definition.name} is not set up for this deployment.`,
      );
    return { config, keyring: this.connect.keyring };
  }

  redirectUri(providerId: string): string {
    return `${this.publicOrigin}/integrations/callback/${providerId}`;
  }

  /** Begin authorization: a single-use state bound to this person and organization, and a PKCE pair. */
  async start(
    p: Principal,
    t: TenantContext,
    providerId: string,
    correlationId: string,
  ): Promise<{ authorizeUrl: string }> {
    const { config } = this.usableProvider(providerId);
    const scopes = config.definition.scopes.map((s) => s.scope);
    const redirectUri = this.redirectUri(providerId);
    const { state, challenge } = await withScope(
      this.database,
      { userId: p.userId, tenantId: t.tenantId },
      async (tx) => {
        const attempt = await beginAttempt(tx, {
          tenantId: t.tenantId,
          userId: p.userId,
          provider: providerId,
          purpose: "connect",
          redirectUri,
          scopes,
        });
        await recordAudit(tx, {
          tenantId: t.tenantId,
          actorUserId: p.userId,
          action: "integration.connect_started",
          targetType: "provider",
          targetId: providerId,
          correlationId,
        });
        return attempt;
      },
    );
    return {
      authorizeUrl: authorizeUrl(config, { redirectUri, state, challenge, scopes }),
    };
  }

  /**
   * Finish authorization. The state is consumed (committed) before the code is
   * exchanged, so a replayed callback fails even if it races the first one.
   */
  async callback(
    p: Principal,
    t: TenantContext,
    input: ConnectCallback,
    correlationId: string,
  ): Promise<ConnectionView> {
    const { config, keyring } = this.usableProvider(input.provider);
    const scope = { userId: p.userId, tenantId: t.tenantId };
    const attempt = await withScope(this.database, scope, (tx) =>
      consumeAttempt(tx, { state: input.state, provider: input.provider, purpose: "connect" }),
    );

    let tokens;
    let identity;
    try {
      tokens = await exchangeCode(config, {
        code: input.code,
        redirectUri: attempt.redirectUri,
        verifier: attempt.codeVerifier,
        scopes: attempt.scopes,
      });
      identity = await fetchIdentity(config, tokens.accessToken);
    } catch (error) {
      if (error instanceof ProviderError) {
        await withScope(this.database, scope, (tx) =>
          recordAudit(tx, {
            tenantId: t.tenantId,
            actorUserId: p.userId,
            action: "integration.connect_failed",
            targetType: "provider",
            targetId: input.provider,
            metadata: { reason: error.kind },
            correlationId,
          }),
        );
        throw providerFailed(error);
      }
      throw error;
    }

    const id = await withScope(this.database, scope, async (tx) => {
      const [existing] = await tx
        .select({ id: conns.id })
        .from(conns)
        .where(
          and(
            eq(conns.tenantId, t.tenantId),
            eq(conns.provider, input.provider),
            eq(conns.accountId, identity.id),
            isNull(conns.revokedAt),
          ),
        );
      const connectionId = existing?.id ?? newConnectionId();
      const sealed = {
        accessTokenSealed: seal(
          keyring,
          tokens.accessToken,
          tokenContext(t.tenantId, connectionId, "access"),
        ),
        refreshTokenSealed: tokens.refreshToken
          ? seal(keyring, tokens.refreshToken, tokenContext(t.tenantId, connectionId, "refresh"))
          : null,
        tokenKeyId: keyring.activeKeyId,
        tokenExpiresAt: tokens.expiresAt,
        grantedScopes: [...tokens.scopes],
        accountLabel: identity.label,
        connectedByUserId: p.userId,
        lastError: null,
      };
      if (existing) {
        await tx
          .update(conns)
          .set({ ...sealed, status: "connected" })
          .where(eq(conns.id, connectionId));
      } else {
        await tx.insert(conns).values({
          id: connectionId,
          tenantId: t.tenantId,
          provider: input.provider,
          accountId: identity.id,
          ...sealed,
        });
      }
      await recordAudit(tx, {
        tenantId: t.tenantId,
        actorUserId: p.userId,
        action: "integration.connected",
        targetType: "integration_connection",
        targetId: connectionId,
        metadata: {
          provider: input.provider,
          account: identity.label,
          scopes: tokens.scopes.join(" "),
          reconnected: Boolean(existing),
        },
        correlationId,
      });
      return connectionId;
    });
    return this.getView(p, t, id);
  }

  /**
   * Disconnect now: the row is marked revoked in this transaction, so no new
   * provider call starts (the worker refuses revoked connections). Revoking
   * the grant at the provider and erasing the sealed tokens is a worker job.
   */
  async disconnect(
    p: Principal,
    t: TenantContext,
    id: string,
    correlationId: string,
  ): Promise<ConnectionView> {
    await withScope(this.database, { userId: p.userId, tenantId: t.tenantId }, async (tx) => {
      const [row] = await tx
        .select({ status: conns.status, provider: conns.provider, tenantId: conns.tenantId })
        .from(conns)
        .where(eq(conns.id, id))
        .for("update");
      if (!row || row.tenantId !== t.tenantId) throw notFound("No such connection.");
      if (row.status === "revoked") return;
      await tx
        .update(conns)
        .set({ status: "revoked", revokedAt: new Date(), revokedByUserId: p.userId })
        .where(eq(conns.id, id));
      await enqueueJob(tx, {
        tenantId: t.tenantId,
        type: CONNECT_REVOKE_JOB,
        payload: { connectionId: id },
        subjectRef: id,
        idempotencyKey: id,
        createdByUserId: p.userId,
        correlationId,
      });
      await recordAudit(tx, {
        tenantId: t.tenantId,
        actorUserId: p.userId,
        action: "integration.disconnected",
        targetType: "integration_connection",
        targetId: id,
        metadata: { provider: row.provider },
        correlationId,
      });
    });
    return this.getView(p, t, id);
  }

  /** Ask the worker to call the provider with the stored grant and report the result on the connection. */
  async check(
    p: Principal,
    t: TenantContext,
    id: string,
    correlationId: string,
  ): Promise<{ jobId: string }> {
    return withScope(this.database, { userId: p.userId, tenantId: t.tenantId }, async (tx) => {
      const [row] = await tx
        .select({ status: conns.status, tenantId: conns.tenantId })
        .from(conns)
        .where(eq(conns.id, id));
      if (!row || row.tenantId !== t.tenantId) throw notFound("No such connection.");
      if (row.status === "revoked")
        throw conflict(
          "connection_revoked",
          "This connection was disconnected. Connect again to use it.",
        );
      const job = await enqueueJob(tx, {
        tenantId: t.tenantId,
        type: CONNECT_CHECK_JOB,
        payload: { connectionId: id },
        subjectRef: id,
        createdByUserId: p.userId,
        correlationId,
      });
      await recordAudit(tx, {
        tenantId: t.tenantId,
        actorUserId: p.userId,
        action: "integration.check_requested",
        targetType: "integration_connection",
        targetId: id,
        metadata: { jobId: job.id },
        correlationId,
      });
      return { jobId: job.id };
    });
  }

  async deliveries(p: Principal, t: TenantContext, id: string): Promise<WebhookDeliveryView[]> {
    await this.getView(p, t, id);
    const rows = await withScope(this.database, { userId: p.userId, tenantId: t.tenantId }, (tx) =>
      tx
        .select({
          id: webhookDeliveries.id,
          event: webhookDeliveries.event,
          deliveryId: webhookDeliveries.deliveryId,
          byteSize: webhookDeliveries.byteSize,
          receivedAt: webhookDeliveries.receivedAt,
        })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.connectionId, id))
        .orderBy(desc(webhookDeliveries.receivedAt))
        .limit(20),
    );
    return rows.map((r) => ({ ...r, receivedAt: r.receivedAt.toISOString() }));
  }

  /**
   * Inbound webhook. No session: the signature (over the raw bytes) is the
   * authentication, then core.accept_webhook() finds the tenant, refuses
   * revoked connections and records the delivery id once (replay and retry
   * defense). Refusals never say whether a connection exists until the
   * signature has verified.
   */
  async acceptWebhook(
    providerId: string,
    connectionId: string,
    headers: Readonly<Record<string, string | string[] | undefined>>,
    raw: Buffer | undefined,
    correlationId: string,
  ): Promise<WebhookOutcome> {
    const refuse = (
      status: 400 | 401 | 404 | 410 | 413 | 415,
      error: string,
      message: string,
    ): WebhookOutcome => ({
      status,
      body: { error, message },
    });
    const config = findProvider(this.connect, providerId);
    if (!config) return refuse(404, "not_found", "No such webhook endpoint.");
    const type = String(headers["content-type"] ?? "").toLowerCase();
    if (!raw || !type.startsWith("application/json"))
      return refuse(415, "json_required", "Send the delivery as application/json.");
    if (raw.length > WEBHOOK_MAX_BYTES)
      return refuse(413, "too_large", "The delivery is too large.");
    const check = verifyWebhook(config, headers, raw);
    if (!check.ok) {
      if (check.reason === "not_configured")
        return refuse(404, "not_found", "Webhooks are not set up for this provider.");
      return refuse(401, check.reason, "The delivery could not be verified.");
    }
    if (!/^con_[0-9a-hjkmnp-tv-z]{26}$/.test(connectionId))
      return refuse(404, "not_found", "No such connection.");
    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      return refuse(400, "invalid_json", "The delivery is not valid JSON.");
    }
    const result = await this.database.execute<{ result: string }>(
      sql`select core.accept_webhook(${connectionId}, ${providerId}, ${check.deliveryId}, ${check.event},
        ${JSON.stringify(payload)}::jsonb, ${createHash("sha256").update(raw).digest("hex")}, ${raw.length},
        ${newWebhookDeliveryId()}, ${newEventId()}, ${correlationId}) as result`,
    );
    switch (result.rows[0]?.result) {
      case "accepted":
        return { status: 200, body: { status: "accepted" } };
      case "duplicate":
        return { status: 200, body: { status: "duplicate" } };
      case "revoked":
        return refuse(410, "connection_revoked", "This connection was disconnected.");
      default:
        return refuse(404, "not_found", "No such connection.");
    }
  }
}
