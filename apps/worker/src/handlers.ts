/**
 * A job handler the worker can run. The Postgres-backed queue and the
 * `WorkflowRunner` interface arrive in Phase 07 (ADR-003); outbox dispatch in
 * Phase 06. Phase 01 registers no handlers, and the worker says so at startup
 * rather than pretending to process work.
 */
export interface JobHandler {
  readonly jobType: string;
  handle(payload: unknown): Promise<void>;
}

export const registeredHandlers: readonly JobHandler[] = [];
