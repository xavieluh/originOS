// Opaque, prefixed, time-sortable identifiers for domain objects (ARCHITECTURE §6).
// Format: `<prefix>_<26 Crockford base32 characters>`, the same 128 bits as a
// ULID: 48 bits of millisecond time, then 80 random bits. The prefix names the
// object kind, so logs and cross-module references are readable without
// leaking sequence numbers.

import { z } from "zod";

/** Every kind of domain object and its id prefix. Prefixes never change once released. */
export const OBJECT_KINDS = {
  subject: "sub",
  identity_claim: "idc",
  work: "wrk",
  work_version: "wkv",
  artifact: "art",
  source: "src",
  claim: "clm",
  agent_run: "run",
  tool_action: "act",
  approval: "apr",
  provenance_assertion: "pas",
  relation: "rel",
} as const;

export type ObjectKind = keyof typeof OBJECT_KINDS;
export type IdPrefix = (typeof OBJECT_KINDS)[ObjectKind];

/** Outbox events use the same format but are not domain objects. */
export const EVENT_ID_PREFIX = "evt";
/** Uploads and jobs (Phase 07) are plumbing records, not domain objects either. */
export const UPLOAD_ID_PREFIX = "upl";
export const JOB_ID_PREFIX = "job";
/** Origin Connect (Phase 08): provider connections and received webhook deliveries. */
export const CONNECTION_ID_PREFIX = "con";
export const WEBHOOK_DELIVERY_ID_PREFIX = "whd";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"; // Crockford base32, lowercase
const BODY = /^[0-9a-hjkmnp-tv-z]{26}$/;
export const ID_PATTERN = /^[a-z]{3}_[0-9a-hjkmnp-tv-z]{26}$/;

type RandomBytes = (size: number) => Uint8Array;
const defaultRandom: RandomBytes = (size) => crypto.getRandomValues(new Uint8Array(size));

/** 26-character body: 10 characters of time, 16 of randomness. */
export function idBody(now: number = Date.now(), random: RandomBytes = defaultRandom): string {
  if (!Number.isSafeInteger(now) || now < 0 || now >= 2 ** 48)
    throw new RangeError("time out of range");
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = random(10);
  // 80 bits -> 16 characters of 5 bits each.
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let rand = "";
  for (let i = 0; i < 16; i++) {
    rand = ALPHABET[Number(bits & 31n)] + rand;
    bits >>= 5n;
  }
  return time + rand;
}

export function newId(kind: ObjectKind, now?: number): string {
  return `${OBJECT_KINDS[kind]}_${idBody(now)}`;
}

export function newEventId(now?: number): string {
  return `${EVENT_ID_PREFIX}_${idBody(now)}`;
}

export function newUploadId(now?: number): string {
  return `${UPLOAD_ID_PREFIX}_${idBody(now)}`;
}

export function newJobId(now?: number): string {
  return `${JOB_ID_PREFIX}_${idBody(now)}`;
}

export function newConnectionId(now?: number): string {
  return `${CONNECTION_ID_PREFIX}_${idBody(now)}`;
}

export function newWebhookDeliveryId(now?: number): string {
  return `${WEBHOOK_DELIVERY_ID_PREFIX}_${idBody(now)}`;
}

const KIND_BY_PREFIX = new Map<string, ObjectKind>(
  Object.entries(OBJECT_KINDS).map(([kind, prefix]) => [prefix, kind as ObjectKind]),
);

/** The kind an id names, or null if it is not a well-formed domain object id. */
export function kindOf(id: string): ObjectKind | null {
  const [prefix, body, extra] = id.split("_");
  if (extra !== undefined || !prefix || !body || !BODY.test(body)) return null;
  return KIND_BY_PREFIX.get(prefix) ?? null;
}

/** Zod schema for an id of one kind. */
export const idOf = (kind: ObjectKind) =>
  z.string().regex(new RegExp(`^${OBJECT_KINDS[kind]}_[0-9a-hjkmnp-tv-z]{26}$`), `a ${kind} id`);

export const ObjectId = z.string().refine((v) => kindOf(v) !== null, "a domain object id");
