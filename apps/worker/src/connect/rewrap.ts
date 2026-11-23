// Token key rotation (Phase 08, ADR-027): rewrap sealed tokens whose data
// keys are wrapped with a key that is no longer active. The token
// ciphertext is unchanged; only the wrapped data key is replaced. Once a
// sweep reports zero remaining, the old key can be removed from
// CONNECT_TOKEN_KEYS.
import { type Keyring, rewrap, tokenContext } from "@originos/connect";
import { type Db, schema } from "@originos/db";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";

const { integrationConnections: conns } = schema;

export async function rewrapTokens(
  db: Db,
  keyring: Keyring,
  limit = 200,
): Promise<{ rewrapped: number; failed: number }> {
  const rows = await db
    .select({
      id: conns.id,
      tenantId: conns.tenantId,
      access: conns.accessTokenSealed,
      refresh: conns.refreshTokenSealed,
      kid: conns.tokenKeyId,
    })
    .from(conns)
    .where(
      and(
        isNotNull(conns.accessTokenSealed),
        ne(sql`coalesce(${conns.tokenKeyId}, '')`, keyring.activeKeyId),
      ),
    )
    .limit(limit);
  let rewrapped = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const access = rewrap(keyring, row.access!, tokenContext(row.tenantId, row.id, "access"));
      const refresh = row.refresh
        ? rewrap(keyring, row.refresh, tokenContext(row.tenantId, row.id, "refresh"))
        : null;
      // Optimistic: skip if a refresh or disconnect changed the row meanwhile.
      const done = await db
        .update(conns)
        .set({
          accessTokenSealed: access,
          refreshTokenSealed: refresh,
          tokenKeyId: keyring.activeKeyId,
        })
        .where(and(eq(conns.id, row.id), eq(conns.accessTokenSealed, row.access!)))
        .returning({ id: conns.id });
      rewrapped += done.length;
    } catch {
      failed += 1;
    }
  }
  return { rewrapped, failed };
}
