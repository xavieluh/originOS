import { sql } from "drizzle-orm";
import type { Db } from "./client.js";

/** A transaction handle with the same query API as Db. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface Scope {
  /** The signed-in user. Required: there is no anonymous tenant access. */
  readonly userId: string;
  /** The organization (tenant) the request acts in, if any. */
  readonly tenantId?: string | null;
  /** SHA-256 hex of an invitation token the caller presented. */
  readonly invitationTokenHash?: string | null;
}

/**
 * Run `fn` in a transaction whose row-level-security context is `scope`.
 * Settings are transaction-local (`set_config(..., true)`), so they can never
 * leak to the next user of a pooled connection.
 */
export async function withScope<T>(db: Db, scope: Scope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.user_id', ${scope.userId}, true),
                 set_config('app.tenant_id', ${scope.tenantId ?? ""}, true),
                 set_config('app.invitation_token_hash', ${scope.invitationTokenHash ?? ""}, true)`,
    );
    return fn(tx);
  });
}

/** Switch the tenant inside a scoped transaction (organization creation, invitation acceptance). */
export async function setTenant(tx: Tx, tenantId: string): Promise<void> {
  await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
}
