// The outbox event envelope (ADR-003). Written in the same transaction as the
// change it describes; delivered at least once; each consumer processes an
// event at most once logically, by recording (eventId, consumer).

import { z } from "zod";
import { ID_PATTERN } from "./ids.js";

export const EventType = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, "dotted lowercase, e.g. work.version_created");

export const EventEnvelope = z.object({
  eventId: z.string().regex(/^evt_[0-9a-hjkmnp-tv-z]{26}$/),
  tenantId: z.uuid().nullable(),
  type: EventType,
  schemaVersion: z.number().int().positive(),
  /** The object the event is about, when there is one. */
  subjectRef: z.string().regex(ID_PATTERN).nullable(),
  /** Ids and facts only: never secrets, tokens or private content. */
  payload: z.record(z.string(), z.unknown()),
  correlationId: z.string().nullable(),
  causationId: z.string().nullable(),
  occurredAt: z.iso.datetime({ offset: true }),
});
export type EventEnvelope = z.infer<typeof EventEnvelope>;

export const OUTBOX_STATUSES = ["pending", "delivered", "dead"] as const;
