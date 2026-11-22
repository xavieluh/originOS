// Outbox dispatcher (ADR-003, ADR-025). Claims ready events under a lease,
// runs every subscribed consumer at most once per event (receipt and the
// consumer's writes commit together), then settles the event: delivered,
// retried with backoff, or dead-lettered after too many attempts.
//
// Delivery semantics: an event is "delivered" once every consumer registered
// at that moment has processed it. An event no consumer subscribes to is
// delivered with no effect; consumers added later do not see past events
// (replay is a separate, explicit operation, not implemented here).
import {
  type Db,
  type OutboxEvent,
  type Tx,
  backoffMs,
  claimEvents,
  consumeOnce,
  markDelivered,
  markFailed,
} from "@originos/db";

export interface OutboxConsumer {
  /** Stable name: it is the idempotency key together with the event id. Never rename a live consumer. */
  readonly name: string;
  /** Event types this consumer subscribes to. */
  readonly eventTypes: readonly string[];
  /** Runs inside the receipt's transaction, as the worker role. Throw to retry. */
  handle(event: OutboxEvent, tx: Tx): Promise<void>;
}

export interface DispatcherOptions {
  readonly db: Db;
  readonly consumers: readonly OutboxConsumer[];
  readonly workerId: string;
  readonly batchSize?: number;
  readonly leaseMs?: number;
  readonly maxAttempts?: number;
  /** Backoff after a failure, by attempt number. Defaults to backoffMs. */
  readonly retryInMs?: (attempts: number) => number;
  readonly log?: DispatcherLog;
}

export interface DispatcherLog {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export interface DispatchResult {
  readonly claimed: number;
  readonly delivered: number;
  readonly retried: number;
  readonly dead: number;
  /** Events this worker lost the lease on before settling (another worker took over). */
  readonly lost: number;
}

export interface OutboxDispatcher {
  readonly consumers: readonly OutboxConsumer[];
  /** Claim and process one batch. */
  runOnce(): Promise<DispatchResult>;
  /** Poll every `intervalMs` until stopped. Does nothing when no consumers are registered. */
  start(intervalMs: number): void;
  /** Stop polling and wait for the batch in flight. */
  stop(): Promise<void>;
}

const silent: DispatcherLog = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** A short, storable reason. Error text is truncated by markFailed; consumers must not put secrets in it. */
function reason(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : "non-error thrown";
}

export function createOutboxDispatcher(options: DispatcherOptions): OutboxDispatcher {
  const names = new Set<string>();
  for (const c of options.consumers) {
    if (names.has(c.name)) throw new Error(`Duplicate outbox consumer name: ${c.name}`);
    names.add(c.name);
  }
  const log = options.log ?? silent;
  const leaseMs = options.leaseMs ?? 60_000;
  const maxAttempts = options.maxAttempts ?? 10;
  const retryInMs = options.retryInMs ?? backoffMs;
  let timer: NodeJS.Timeout | null = null;
  let inFlight: Promise<unknown> = Promise.resolve();

  async function process(event: OutboxEvent): Promise<keyof Omit<DispatchResult, "claimed">> {
    const subscribed = options.consumers.filter((c) => c.eventTypes.includes(event.type));
    try {
      for (const consumer of subscribed) {
        await consumeOnce(options.db, event.id, consumer.name, (tx) => consumer.handle(event, tx));
      }
    } catch (error) {
      const outcome = await markFailed(options.db, event, options.workerId, reason(error), {
        retryInMs: retryInMs(event.attempts),
        maxAttempts,
      });
      const fields = { eventId: event.id, type: event.type, attempts: event.attempts };
      if (outcome === "dead") log.error(fields, "outbox event dead-lettered");
      else log.warn(fields, "outbox event failed; will retry");
      return outcome === "dead" ? "dead" : "retried";
    }
    if (await markDelivered(options.db, event.id, options.workerId)) return "delivered";
    log.warn(
      { eventId: event.id },
      "outbox lease expired before delivery; another worker will settle it",
    );
    return "lost";
  }

  async function runOnce(): Promise<DispatchResult> {
    const result = { claimed: 0, delivered: 0, retried: 0, dead: 0, lost: 0 };
    const events = await claimEvents(options.db, {
      workerId: options.workerId,
      limit: options.batchSize ?? 20,
      leaseMs,
    });
    result.claimed = events.length;
    for (const event of events) result[await process(event)] += 1;
    return result;
  }

  return {
    consumers: options.consumers,
    runOnce,
    start(intervalMs) {
      if (timer || options.consumers.length === 0) return;
      const tick = () => {
        inFlight = runOnce()
          .catch((error: unknown) => log.error({ err: reason(error) }, "outbox dispatch failed"))
          .finally(() => {
            if (timer) timer = setTimeout(tick, intervalMs);
          });
      };
      timer = setTimeout(tick, 0);
    },
    async stop() {
      if (timer) clearTimeout(timer);
      timer = null;
      await inFlight;
    },
  };
}
