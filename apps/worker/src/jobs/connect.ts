// Origin Connect jobs (Phase 08): check a connection with its stored grant,
// and revoke a disconnected connection's grant at the provider.
import { CONNECT_CHECK_JOB, CONNECT_REVOKE_JOB } from "@originos/contracts";
import {
  type Connect,
  ProviderError,
  findProvider,
  open,
  revokeGrant,
  tokenContext,
  usable,
} from "@originos/connect";
import { schema } from "@originos/db";
import { eq } from "drizzle-orm";
import {
  ConnectionRevoked,
  createProviderClient,
  ProviderUnavailable,
} from "../connect/provider-client.js";
import { type JobHandler, PermanentJobError } from "../job-runner.js";

const { integrationConnections: conns } = schema;

const connectionIdOf = (payload: Record<string, unknown>) => {
  const id = payload.connectionId;
  if (typeof id !== "string" || !/^con_[0-9a-hjkmnp-tv-z]{26}$/.test(id))
    throw new PermanentJobError("The job has no valid connection id.");
  return id;
};

export function connectCheckHandler(connect: Connect): JobHandler {
  return {
    type: CONNECT_CHECK_JOB,
    async run(ctx) {
      const id = connectionIdOf(ctx.job.payload);
      const client = createProviderClient(ctx.db, connect);
      const config = (
        await ctx.db.select({ provider: conns.provider }).from(conns).where(eq(conns.id, id))
      )[0];
      const provider = config && findProvider(connect, config.provider);
      try {
        await client.call(ctx.job.tenantId, id, {
          method: "GET",
          path: provider?.definition.identityPath ?? "/",
        });
        await ctx.db
          .update(conns)
          .set({ lastCheckedAt: new Date(), lastError: null })
          .where(eq(conns.id, id));
        return { connectionId: id, ok: true };
      } catch (error) {
        if (error instanceof ConnectionRevoked)
          return { connectionId: id, ok: false, revoked: true };
        if (!(error instanceof ProviderUnavailable)) {
          await ctx.db.update(conns).set({ lastCheckedAt: new Date() }).where(eq(conns.id, id));
        }
        throw error;
      }
    },
  };
}

/**
 * Revoke the grant at the provider, then erase the sealed tokens. If the
 * provider cannot be reached the job retries; if it refuses for good, or this
 * deployment can no longer call it, the tokens are erased anyway and the
 * reason is recorded on the connection (the provider-side grant may remain;
 * the person can remove it in the provider's settings).
 */
export function connectRevokeHandler(connect: Connect): JobHandler {
  return {
    type: CONNECT_REVOKE_JOB,
    async run(ctx) {
      const id = connectionIdOf(ctx.job.payload);
      const [row] = await ctx.db.select().from(conns).where(eq(conns.id, id));
      if (!row || row.tenantId !== ctx.job.tenantId)
        throw new PermanentJobError("The connection this job refers to does not exist.");
      if (row.status !== "revoked")
        throw new PermanentJobError("The connection is not disconnected; refusing to revoke it.");
      if (!row.accessTokenSealed) return { connectionId: id, alreadyErased: true };

      const config = findProvider(connect, row.provider);
      let note: string | null = null;
      if (!config || !usable(connect, config)) {
        note =
          "OriginOS could not revoke the grant at the provider (provider not set up). Remove it in the provider's settings.";
      } else {
        try {
          const token = open(
            connect.keyring!,
            row.accessTokenSealed,
            tokenContext(row.tenantId, row.id, "access"),
          );
          await revokeGrant(config, token);
        } catch (error) {
          if (
            error instanceof ProviderError &&
            error.retryable &&
            ctx.job.attempts < ctx.job.maxAttempts
          )
            throw new ProviderUnavailable(error.message);
          note = `OriginOS could not revoke the grant at the provider (${error instanceof Error ? error.message : "error"}) Remove it in the provider's settings.`;
        }
      }
      await ctx.db
        .update(conns)
        .set({
          accessTokenSealed: null,
          refreshTokenSealed: null,
          tokenKeyId: null,
          tokenExpiresAt: null,
          lastError: note,
        })
        .where(eq(conns.id, id));
      return { connectionId: id, revokedAtProvider: note === null };
    },
  };
}
