// Connect context (Phase 08): provider registry, OAuth connections and inbound webhooks.
export { ConnectModule } from "./connect.module.js";
// Single-use OAuth attempts, also used by IdentityMesh account proofs (Phase 09).
export {
  type Attempt,
  type AttemptPurpose,
  STATE_TTL_MS,
  beginAttempt,
  consumeAttempt,
} from "./attempts.js";
