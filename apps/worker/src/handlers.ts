import type { OutboxConsumer } from "./outbox-dispatcher.js";

/**
 * A job handler the worker can run. The Postgres-backed job queue and the
 * `WorkflowRunner` interface arrive in Phase 07 (ADR-003).
 */
export interface JobHandler {
  readonly jobType: string;
  handle(payload: unknown): Promise<void>;
}

export const registeredHandlers: readonly JobHandler[] = [];

/**
 * Outbox consumers (Phase 06 delivers the dispatcher; modules register their
 * consumers in later phases, e.g. search indexing and notifications). With
 * none registered the worker does not claim events: they stay pending, and
 * the worker says so at startup instead of pretending to deliver them.
 */
export const registeredConsumers: readonly OutboxConsumer[] = [];
