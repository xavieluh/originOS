// Single-use OAuth attempts (ADR-027), shared by organization connections and
// IdentityMesh account proofs (Phase 09). An attempt is bound to the person,
// the organization, the provider and its purpose; it is consumed (committed)
// before the code is exchanged, so a replayed callback fails even if it races.
import { createPkce, hashState, newState } from "@originos/connect";
import { schema, type Tx } from "@originos/db";
import { and, eq, isNull, lt } from "drizzle-orm";
import { badRequest } from "../core/index.js";

const { oauthStates } = schema;

/** Ten minutes: the life of a GitHub authorization code. */
export const STATE_TTL_MS = 10 * 60 * 1000;

export type AttemptPurpose = "connect" | "identity_proof";
export type Attempt = typeof oauthStates.$inferSelect;

export async function beginAttempt(
  tx: Tx,
  input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly provider: string;
    readonly purpose: AttemptPurpose;
    readonly profileId?: string;
    readonly redirectUri: string;
    readonly scopes: readonly string[];
  },
): Promise<{ state: string; challenge: string }> {
  const state = newState();
  const pkce = createPkce();
  // Tidy this person's attempts that can no longer be used.
  await tx.delete(oauthStates).where(lt(oauthStates.expiresAt, new Date()));
  await tx.insert(oauthStates).values({
    stateHash: hashState(state),
    tenantId: input.tenantId,
    userId: input.userId,
    provider: input.provider,
    purpose: input.purpose,
    profileId: input.profileId ?? null,
    codeVerifier: pkce.verifier,
    redirectUri: input.redirectUri,
    scopes: [...input.scopes],
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });
  return { state, challenge: pkce.challenge };
}

/** Consume an attempt for this provider and purpose, or explain why it cannot be used. */
export async function consumeAttempt(
  tx: Tx,
  input: { readonly state: string; readonly provider: string; readonly purpose: AttemptPurpose },
): Promise<Attempt> {
  const stateHash = hashState(input.state);
  const [row] = await tx.select().from(oauthStates).where(eq(oauthStates.stateHash, stateHash));
  // Row-level security hides other people's and other organizations' attempts.
  if (!row || row.provider !== input.provider || row.purpose !== input.purpose)
    throw badRequest(
      "invalid_state",
      "This attempt is not valid here. It may have been started by someone else, for something else, or in another organization. Start again.",
    );
  if (row.consumedAt) throw badRequest("state_used", "This attempt was already used. Start again.");
  if (row.expiresAt <= new Date())
    throw badRequest("state_expired", "This attempt expired. Start again.");
  const consumed = await tx
    .update(oauthStates)
    .set({ consumedAt: new Date() })
    .where(and(eq(oauthStates.stateHash, stateHash), isNull(oauthStates.consumedAt)))
    .returning({ h: oauthStates.stateHash });
  if (consumed.length === 0)
    throw badRequest("state_used", "This attempt was already used. Start again.");
  return row;
}
