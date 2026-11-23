# Deletion and receipt retention

**Status:** policy baseline written in Phase 06 (2026-11-22). The mechanisms marked *built* exist and are tested; the ones marked *Phase 41* (export, erasure requests, retention schedules, legal hold, purge jobs) do not exist yet. Nothing here is legal advice; the owner should have it reviewed before customers rely on it.

OriginOS records evidence: who did what, with which source, under which assurance label. Evidence is only useful if it cannot be quietly rewritten, and people still have the right to leave and to have their personal data erased. This document says how those two pull against each other and what wins where.

## 1. What the database guarantees today (built)

| Rule | How it is enforced | Test |
|---|---|---|
| The application never hard-deletes domain records | `originos_app` has no DELETE privilege on any domain table, relation, outbox event or audit event | `packages/db/test/integration/domain.test.ts` "facts are immutable…" |
| Recorded facts are immutable | Column-level UPDATE grants: only state columns (status, `revoked_at`, review state, display fields) are updatable; hashes, timestamps, attribution and capture method are not | same |
| Withdrawing something is a state change, not a delete | `revoked_at` / status columns; the row and its history stay | same |
| No orphans | Every relation endpoint references the object registry with a real foreign key; deleting an object that still has edges fails, even for the schema owner | "orphans are impossible…" |
| The audit log is tamper-evident | Per-tenant hash chain (`seq`, `prev_hash`, `hash`), set by trigger; `core.verify_audit_chain(tenant)` returns the first broken event | "events form a per-tenant hash chain…" |
| Erasing a person does not break the chain | The chain hashes `actor_digest` (SHA-256 of a fixed prefix and the user id), not `actor_user_id`. Deleting the user sets `actor_user_id` to null; the digest and the chain stay valid | "erasing a person keeps the chain verifiable…" |
| Deleting an organization removes its data | `tenant_id` foreign keys cascade from `core.organizations`. Only the schema owner can delete an organization (there is no API for it yet) | `domain.test.ts` cleanup deletes the test organizations, edges included, and asserts no registry entries remain |

The hash chain detects tampering by anyone who can write the table, including the schema owner. It does not prevent it, and it does not prove *when* an event happened to an outside party. External anchoring (signed checkpoints of the chain head) is part of signed receipts in Phase 20.

## 2. Classes of data and what deletion means for each

| Class | Examples | On a person's erasure request | On organization deletion | Retained after deletion? |
|---|---|---|---|---|
| Account data | name, email, sessions, passkeys, TOTP secrets | Deleted (rows in `core.users` and its dependants) | Unaffected (accounts outlive organizations) | No |
| Personal content | private sources, drafts, uploaded files (Phase 07) | Deleted or, where other members depend on it, transferred to the organization with the person's consent | Deleted (cascade; object storage purge in Phase 41) | No |
| Attribution on shared work | `created_by_subject_id`, contributor edges | The person's subject is pseudonymized: display name replaced, `user_id` cleared. The work and the fact that *a* contributor did something stay | Deleted | No, except inside signed receipts (row 5) |
| Audit events | role changes, grants, consent changes | `actor_user_id` becomes null; the digest stays. Metadata holds ids only, never names, emails or content (a code review rule for `recordAudit`) | Deleted with the organization | Only as long as the organization exists |
| Signed receipts and published attestations (Phase 20, 36) | an execution receipt, a public verification record | Not rewritten: a signature over changed bytes would no longer verify. The receipt is revoked or withdrawn from public view, and personal data is kept out of signed payloads in the first place (row 6) | Revocation published; key history kept for verification | The minimal signed payload, see §3 |
| Provider connections (Phase 08) | account id and name, granted scopes, sealed tokens | Connections the person made stay with the organization (attribution becomes null); the person can disconnect first | Deleted (cascade) | No. Disconnecting erases the sealed tokens once the grant is revoked at the provider |
| Webhook deliveries (Phase 08) | provider payloads as received | Not personal by design, but payloads may name people at the provider | Deleted (cascade) | No; a retention window comes in Phase 41 |
| Outbox events | `work.created` with ids | Ids only; delivered events can be purged after a retention window (Phase 41) | Deleted (cascade) | No |

## 3. The receipt exception, stated honestly

Some records exist to be checked later by someone else: a signed execution receipt, a published provenance assertion, a verifiable credential. If OriginOS deleted or edited them on request, every copy already handed out would stop verifying, and OriginOS would be silently rewriting evidence.

So the rule is:

1. **Design signed payloads so they need no personal data.** They carry opaque ids, content hashes, assurance labels, timestamps and key ids. A person's name, email or private content never goes into bytes that are signed. Phase 20 and Phase 36 must follow this, and their tests should check it.
2. **On erasure, OriginOS keeps the minimal signed payload and deletes everything that linked it to the person** (the subject's `user_id`, display name, account). What remains is a pseudonymous record. It is still personal data wherever someone else can re-identify it, so this is pseudonymization, not anonymization.
3. **Withdrawal is a published state, not a deletion.** The record is marked revoked or withdrawn; verifiers see that status. Public pages (Phase 14) stop showing withdrawn records.
4. **Copies held by third parties are outside OriginOS's control.** The product must say so when a person publishes something signed, before they publish it.
5. **Legal hold (Phase 41) overrides erasure and organization deletion** for the records it names, for as long as the hold lasts, and is itself audited.

## 4. Known gaps (to close in Phase 41 unless noted)

- No export or erasure request flow, retention schedule, purge job or legal hold exists yet.
- Deleting a user today sets `actor_user_id` to null and `subjects.user_id` to null, but does not yet replace the subject's display name; that pseudonymization step belongs to the erasure flow.
- Object storage (Phase 07) needs its own purge and verification. Today: rejected files stay in the quarantine bucket indefinitely (kept so an admin can review them; nobody can download them), clean files have a copy in both buckets, and an object whose database row failed to commit is orphaned in quarantine. Deleting an organization cascades its upload rows but not its objects. Phase 41 adds a purge job keyed on the `tenants/<tenant>/` prefix; Phase 44 adds bucket lifecycle rules (for example, expire quarantine copies after the scan).
- Upload rows keep the file name, size, SHA-256, uploader and scan result; the bytes are never written to logs, job payloads or events (those carry ids only).
- Webhook delivery payloads (Phase 08) are kept as received with no expiry yet; used OAuth attempts (`core.oauth_states`, hashed state and PKCE verifier) are deleted lazily when the same person starts another attempt. Both get scheduled purges in Phase 41.
- Backups keep deleted data until they expire; the backup retention period is set in Phase 44 and must be stated to customers.
- The audit chain is verified on demand only; scheduled verification and alerting arrive with operations (Phase 37/43).
