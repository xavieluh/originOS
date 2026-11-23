// The outbound delivery manager for provider calls (Phase 08, ADR-027).
//
// Every call made with a stored grant goes through `call()`, which:
// - re-reads the connection right before calling and refuses revoked ones
//   (a disconnect stops new calls at once);
// - refreshes an expiring or rejected access token once, if a refresh token
//   exists, and stores the rotated tokens sealed;
// - marks the connection degraded, with a token-free reason, when the provider
//   refuses the grant, and back to connected when a call works again;
// - classifies failures: network errors, 429 and 5xx are retried by the job
//   runner with backoff; refusals are permanent;
// - sends the caller's idempotency key (use `${job.id}:${step}`) so a retried
//   call is not applied twice by providers that honour Idempotency-Key.
import {
  type Connect,
  type ProviderConfig,
  ProviderError,
  type ProviderRequest,
  type ProviderResponse,
  callProvider,
  findProvider,
  open,
  refreshTokens,
  seal,
  tokenContext,
  usable,
} from "@originos/connect";
import { type Db, schema } from "@originos/db";
import { and, eq } from "drizzle-orm";
import { PermanentJobError } from "../job-runner.js";

const { integrationConnections: conns } = schema;
type Connection = typeof conns.$inferSelect;

/** Refresh this long before the provider's stated expiry. */
const EXPIRY_MARGIN_MS = 60_000;

export class ConnectionRevoked extends PermanentJobError {
  constructor() {
    super("The connection was disconnected; no call was made.");
    this.name = "ConnectionRevoked";
  }
}

/** A retryable provider failure (the job runner retries with backoff). */
export class ProviderUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailable";
  }
}

export interface ProviderClient {
  call(tenantId: string, connectionId: string, request: ProviderRequest): Promise<ProviderResponse>;
}

export function createProviderClient(db: Db, connect: Connect): ProviderClient {
  const load = async (tenantId: string, id: string) => {
    const [row] = await db.select().from(conns).where(eq(conns.id, id));
    if (!row || row.tenantId !== tenantId)
      throw new PermanentJobError("The connection this job refers to does not exist.");
    return row;
  };

  const markDegraded = (row: Connection, reason: string) =>
    db
      .update(conns)
      .set({ status: "degraded", lastError: reason })
      .where(and(eq(conns.id, row.id), eq(conns.status, row.status)));

  async function refresh(row: Connection, config: ProviderConfig): Promise<string | null> {
    const keyring = connect.keyring!;
    if (!row.refreshTokenSealed) return null;
    const refreshToken = open(
      keyring,
      row.refreshTokenSealed,
      tokenContext(row.tenantId, row.id, "refresh"),
    );
    const next = await refreshTokens(config, refreshToken, row.grantedScopes);
    // Only store if the connection is still live: a disconnect wins over a refresh.
    const updated = await db
      .update(conns)
      .set({
        accessTokenSealed: seal(
          keyring,
          next.accessToken,
          tokenContext(row.tenantId, row.id, "access"),
        ),
        refreshTokenSealed: next.refreshToken
          ? seal(keyring, next.refreshToken, tokenContext(row.tenantId, row.id, "refresh"))
          : row.refreshTokenSealed,
        tokenKeyId: keyring.activeKeyId,
        tokenExpiresAt: next.expiresAt,
        grantedScopes: [...next.scopes],
      })
      .where(and(eq(conns.id, row.id), eq(conns.status, row.status)))
      .returning({ id: conns.id });
    if (updated.length === 0) throw new ConnectionRevoked();
    return next.accessToken;
  }

  return {
    async call(tenantId, connectionId, request) {
      let row = await load(tenantId, connectionId);
      if (row.status === "revoked" || !row.accessTokenSealed) throw new ConnectionRevoked();
      const config = findProvider(connect, row.provider);
      if (!config || !usable(connect, config))
        throw new PermanentJobError(
          `The provider "${row.provider}" is not set up for this deployment.`,
        );
      const keyring = connect.keyring!;

      try {
        let token = open(
          keyring,
          row.accessTokenSealed,
          tokenContext(row.tenantId, row.id, "access"),
        );
        if (row.tokenExpiresAt && row.tokenExpiresAt.getTime() - EXPIRY_MARGIN_MS <= Date.now()) {
          token = (await refresh(row, config)) ?? token;
          row = await load(tenantId, connectionId);
        }
        // Re-check immediately before calling: a disconnect stops new calls.
        if ((await load(tenantId, connectionId)).status === "revoked")
          throw new ConnectionRevoked();
        let response: ProviderResponse;
        try {
          response = await callProvider(config, token, request);
        } catch (error) {
          if (!(error instanceof ProviderError) || error.kind !== "unauthorized") throw error;
          const refreshed = await refresh(row, config);
          if (!refreshed) throw error;
          row = await load(tenantId, connectionId);
          if (row.status === "revoked") throw new ConnectionRevoked();
          response = await callProvider(config, refreshed, request);
        }
        if (row.status === "degraded") {
          await db
            .update(conns)
            .set({ status: "connected", lastError: null })
            .where(and(eq(conns.id, row.id), eq(conns.status, "degraded")));
        }
        return response;
      } catch (error) {
        if (error instanceof ProviderError) {
          if (error.retryable) throw new ProviderUnavailable(error.message);
          if (error.kind === "unauthorized" || error.kind === "invalid_grant") {
            await markDegraded(row, "The provider refused the stored grant. Reconnect to fix it.");
          }
          throw new PermanentJobError(error.message);
        }
        throw error;
      }
    },
  };
}
