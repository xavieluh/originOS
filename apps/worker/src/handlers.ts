import type { Connect } from "@originos/connect";
import type { ChallengeChecker } from "@originos/identity";
import type { Storage } from "@originos/storage";
import { connectCheckHandler, connectRevokeHandler } from "./jobs/connect.js";
import { identityCheckDomainHandler } from "./jobs/identity.js";
import type { JobHandler } from "./job-runner.js";
import { scanUploadHandler } from "./jobs/scan-upload.js";
import type { OutboxConsumer } from "./outbox-dispatcher.js";

export type { JobHandler } from "./job-runner.js";

/** Job handlers this worker runs (ADR-026). */
export function jobHandlers(
  storage: Storage,
  connect: Connect,
  checker: ChallengeChecker,
): JobHandler[] {
  return [
    scanUploadHandler(storage),
    connectCheckHandler(connect),
    connectRevokeHandler(connect),
    identityCheckDomainHandler(checker),
  ];
}

/**
 * Outbox consumers (Phase 06 delivered the dispatcher; modules register their
 * consumers in later phases, e.g. search indexing and notifications). With
 * none registered the worker does not claim events: they stay pending, and
 * the worker says so at startup instead of pretending to deliver them.
 */
export const registeredConsumers: readonly OutboxConsumer[] = [];
