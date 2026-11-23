// Envelope encryption for provider tokens (Phase 08, ADR-027).
//
// Each sealed value has its own random data key (DEK). The token is encrypted
// with the DEK (AES-256-GCM); the DEK is encrypted ("wrapped") with a
// key-encryption key (KEK) from the keyring. Both layers bind the caller's
// context (tenant and connection) as additional authenticated data, so a
// sealed token copied to another row does not open.
//
// Rotation adds a new KEK, makes it active, and rewraps existing DEKs: the
// token ciphertext is untouched, and old keys can be removed once no sealed
// value names them. The keyring interface is where a cloud KMS plugs in later
// (Phase 44); today the KEKs come from CONNECT_TOKEN_KEYS.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const KEY_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

export interface Keyring {
  readonly activeKeyId: string;
  readonly keys: ReadonlyMap<string, Buffer>;
}

/** Thrown for malformed, tampered or wrong-context sealed values. Never carries plaintext. */
export class SealError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SealError";
  }
}

/**
 * Parse `kid:base64key,kid2:base64key`. Each key is 32 random bytes in base64 or
 * base64url. The active key defaults to the last one listed.
 */
export function parseKeyring(spec: string, activeKeyId?: string): Keyring {
  const keys = new Map<string, Buffer>();
  for (const entry of spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const at = entry.indexOf(":");
    const kid = entry.slice(0, at);
    if (at < 1 || !KEY_ID.test(kid)) throw new SealError("A token key id is malformed.");
    const key = Buffer.from(entry.slice(at + 1), "base64");
    if (key.length !== 32) throw new SealError(`Token key "${kid}" must be 32 bytes.`);
    if (keys.has(kid)) throw new SealError(`Token key "${kid}" is listed twice.`);
    keys.set(kid, key);
  }
  if (keys.size === 0) throw new SealError("No token keys are configured.");
  const active = activeKeyId ?? [...keys.keys()].at(-1)!;
  if (!keys.has(active)) throw new SealError(`The active token key "${active}" is not listed.`);
  return { activeKeyId: active, keys };
}

/** A fresh key for CONNECT_TOKEN_KEYS (development and tests). */
export function generateKeySpec(kid = "k1"): string {
  return `${kid}:${randomBytes(32).toString("base64")}`;
}

const b64 = (b: Buffer) => b.toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url");

function gcmEncrypt(key: Buffer, plaintext: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return [b64(iv), b64(ct), b64(cipher.getAuthTag())].join(".");
}

function gcmDecrypt(key: Buffer, packed: string, aad: string): Buffer {
  const parts = packed.split(".");
  if (parts.length !== 3) throw new SealError("A sealed value is malformed.");
  const [iv, ct, tag] = parts.map(unb64) as [Buffer, Buffer, Buffer];
  if (iv.length !== 12 || tag.length !== 16) throw new SealError("A sealed value is malformed.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new SealError("A sealed value did not verify (wrong key, context or tampered).");
  }
}

interface Parsed {
  readonly kid: string;
  readonly wrapped: string;
  readonly payload: string;
}

function parse(sealed: string): Parsed {
  const parts = sealed.split("~");
  if (parts.length !== 4 || parts[0] !== VERSION)
    throw new SealError("A sealed value is malformed.");
  return { kid: parts[1]!, wrapped: parts[2]!, payload: parts[3]! };
}

function kek(keyring: Keyring, kid: string): Buffer {
  const key = keyring.keys.get(kid);
  if (!key) throw new SealError(`Token key "${kid}" is not in the keyring.`);
  return key;
}

const wrapAad = (kid: string, context: string) => `originos.connect.dek|${kid}|${context}`;
const dataAad = (context: string) => `originos.connect.token|${context}`;

/** Seal a secret under the active key. `context` must be the same when opening. */
export function seal(keyring: Keyring, plaintext: string, context: string): string {
  const dek = randomBytes(32);
  try {
    const kid = keyring.activeKeyId;
    const wrapped = gcmEncrypt(kek(keyring, kid), dek, wrapAad(kid, context));
    const payload = gcmEncrypt(dek, Buffer.from(plaintext, "utf8"), dataAad(context));
    return [VERSION, kid, wrapped, payload].join("~");
  } finally {
    dek.fill(0);
  }
}

export function open(keyring: Keyring, sealed: string, context: string): string {
  const { kid, wrapped, payload } = parse(sealed);
  const dek = gcmDecrypt(kek(keyring, kid), wrapped, wrapAad(kid, context));
  try {
    return gcmDecrypt(dek, payload, dataAad(context)).toString("utf8");
  } finally {
    dek.fill(0);
  }
}

/** The key id a sealed value is wrapped with. */
export function sealedKeyId(sealed: string): string {
  return parse(sealed).kid;
}

/** Rewrap a sealed value's data key under the active key, without touching the token ciphertext. */
export function rewrap(keyring: Keyring, sealed: string, context: string): string {
  const { kid, wrapped, payload } = parse(sealed);
  if (kid === keyring.activeKeyId) return sealed;
  const dek = gcmDecrypt(kek(keyring, kid), wrapped, wrapAad(kid, context));
  try {
    const next = keyring.activeKeyId;
    return [
      VERSION,
      next,
      gcmEncrypt(kek(keyring, next), dek, wrapAad(next, context)),
      payload,
    ].join("~");
  } finally {
    dek.fill(0);
  }
}

/** The AAD context for a connection's tokens. */
export const tokenContext = (tenantId: string, connectionId: string, kind: "access" | "refresh") =>
  `${tenantId}|${connectionId}|${kind}`;
