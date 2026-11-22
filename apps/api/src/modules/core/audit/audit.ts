import { type Tx, schema } from "@originos/db";

export interface AuditInput {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  /** Non-secret facts only: never tokens, credentials or personal data beyond ids. */
  readonly metadata?: Record<string, string | number | boolean | null>;
  readonly correlationId: string;
}

/** Append one audit event inside the caller's scoped transaction (append-only by RLS). */
export function recordAudit(tx: Tx, input: AuditInput) {
  return tx.insert(schema.auditEvents).values({ ...input, metadata: input.metadata ?? {} });
}
