// Transactional outbox (ADR-003). Producers append events inside the same
// transaction as their change; the worker claims, delivers and settles them.
// Delivery is at least once. Each consumer runs inside a transaction that also
// records (event, consumer) in core.outbox_receipts, so a retried event is
// processed at most once logically by each consumer.
import { EventType, newEventId } from "@originos/contracts";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./client.js";
import { outboxEvents, outboxReceipts } from "./domain-schema.js";
import type { Tx } from "./scope.js";

export type OutboxEvent = typeof outboxEvents.$inferSelect;

export interface NewEvent {
  readonly tenantId: string;
  readonly type: string;
  readonly schemaVersion?: number;
  readonly subjectRef?: string | null;
  /** Ids and facts only: never secrets, tokens or private content. */
  readonly payload?: Record<string, unknown>;
  readonly correlationId?: string | null;
  readonly causationId?: string | null;
}

/** Append an event in the caller's (scoped) transaction. Returns its id. */
export async function enqueueEvent(tx: Tx, event: NewEvent): Promise<string> {
  const type = EventType.parse(event.type);
  const id = newEventId();
  await tx.insert(outboxEvents).values({
    id,
    tenantId: event.tenantId,
    type,
    schemaVersion: event.schemaVersion ?? 1,
    subjectRef: event.subjectRef ?? null,
    payload: event.payload ?? {},
    correlationId: event.correlationId ?? null,
    causationId: event.causationId ?? null,
  });
  return id;
}

export interface ClaimOptions {
  readonly workerId: string;
  readonly limit: number;
  /** How long a claim lasts. If the worker dies, the event becomes claimable again after this. */
  readonly leaseMs: number;
}

/**
 * Claim up to `limit` ready events: pending, due, and not leased by a live
 * worker. SKIP LOCKED lets several workers claim concurrently without
 * blocking or double-claiming. Commits the lease immediately.
 */
export async function claimEvents(db: Db, options: ClaimOptions): Promise<OutboxEvent[]> {
  const result = await db.execute<{ id: string }>(sql`
    update core.outbox_events e
       set locked_by = ${options.workerId},
           locked_until = now() + make_interval(secs => ${options.leaseMs / 1000}),
           attempts = e.attempts + 1
     where e.id in (
       select id from core.outbox_events
        where status = 'pending' and available_at <= now()
          and (locked_until is null or locked_until < now())
        order by available_at, id
        limit ${options.limit}
        for update skip locked)
    returning e.id`);
  const ids = result.rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const rows = await db.select().from(outboxEvents).where(inArray(outboxEvents.id, ids));
  return rows.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * Run `handler` for `consumer` at most once per event. The receipt and the
 * handler's own writes commit together, so a crash before commit leaves no
 * receipt (the event is retried) and a crash after commit leaves the receipt
 * (the retry skips it). Returns false when the consumer had already processed it.
 */
export async function consumeOnce(
  db: Db,
  eventId: string,
  consumer: string,
  handler: (tx: Tx) => Promise<void>,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(outboxReceipts)
      .values({ eventId, consumer })
      .onConflictDoNothing()
      .returning({ eventId: outboxReceipts.eventId });
    if (inserted.length === 0) return false;
    await handler(tx);
    return true;
  });
}

/** Mark delivered, only if this worker still holds the lease. */
export async function markDelivered(db: Db, eventId: string, workerId: string): Promise<boolean> {
  const rows = await db
    .update(outboxEvents)
    .set({
      status: "delivered",
      deliveredAt: new Date(),
      lockedBy: null,
      lockedUntil: null,
      lastError: null,
    })
    .where(and(eq(outboxEvents.id, eventId), eq(outboxEvents.lockedBy, workerId)))
    .returning({ id: outboxEvents.id });
  return rows.length > 0;
}

/**
 * Release a failed event for retry after `retryInMs`, or dead-letter it after
 * `maxAttempts`. The error text is stored truncated; callers must not put
 * secrets in error messages.
 */
export async function markFailed(
  db: Db,
  event: Pick<OutboxEvent, "id" | "attempts">,
  workerId: string,
  error: string,
  options: { readonly retryInMs: number; readonly maxAttempts: number },
): Promise<"retry" | "dead"> {
  const dead = event.attempts >= options.maxAttempts;
  await db
    .update(outboxEvents)
    .set({
      status: dead ? "dead" : "pending",
      availableAt: new Date(Date.now() + options.retryInMs),
      lockedBy: null,
      lockedUntil: null,
      lastError: error.slice(0, 500),
    })
    .where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.lockedBy, workerId)));
  return dead ? "dead" : "retry";
}

/** Exponential backoff with a cap: 1s, 2s, 4s … up to 5 minutes. */
export function backoffMs(attempts: number, baseMs = 1_000, capMs = 300_000): number {
  return Math.min(capMs, baseMs * 2 ** Math.max(0, attempts - 1));
}
