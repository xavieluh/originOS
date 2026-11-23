// PKCE (RFC 7636, S256 only) and OAuth state values (Phase 08, ADR-027).
import { createHash, randomBytes } from "node:crypto";

export interface Pkce {
  readonly verifier: string;
  readonly challenge: string;
  readonly method: "S256";
}

/** 32 random bytes as base64url: a 43-character verifier, within RFC 7636's 43-128. */
export function createPkce(): Pkce {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: s256(verifier), method: "S256" };
}

export function s256(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

/** An unguessable state value; only its hash is stored. */
export function newState(): string {
  return randomBytes(32).toString("base64url");
}

export function hashState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}
