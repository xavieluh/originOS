# OriginOS threat model — baseline

**Status:** v1.0, accepted by owner 2026-11-22 (Phase 00). Threats and controls per trust boundary. Controls marked **Built in NN** exist and are tested in that phase (see ACCEPTANCE_MATRIX); tenant isolation and backend authorization are built and tested in Phases 04–07 (row-level security, one evaluator, tenant-prefixed storage keys). Everything else is still planned. Full STRIDE per subsystem happens in Phase 42 and must replace the remaining planned controls with tested evidence.

## High-priority assets
Agent histories and traces; unpublished manuscripts; creator personal information; private research and licensed full text; API keys, ingest keys and OAuth grants; signing keys; billing data; signed records and receipts; audit log integrity.

## Trust boundaries

| # | Boundary | Untrusted side |
|---|---|---|
| B1 | Internet → web/API | Anonymous users, signed-in users of other tenants |
| B2 | Claude/MCP client → MCP server | External AI client acting for a user; tool arguments may be model-generated |
| B3 | Collector/SDK → telemetry ingest | Customer machines and agents; payloads may contain secrets |
| B4 | Provider → inbound webhook | GitHub, Slack, Stripe, WordPress callbacks (spoofable) |
| B5 | Uploaded/imported file → worker → media validator / AI worker | Hostile documents and media |
| B6 | Retrieved content → AI gateway → model | Prompt injection in sources, web pages, drafts |
| B7 | API/worker → external provider (outbound) | SSRF targets, compromised provider responses |
| B8 | Staff/admin console → tenant data | Insiders |
| B9 | Application → signer/KMS | Anything that could request signatures |

## Threats and planned controls

| Threat | Boundary | STRIDE | Planned control | Verified in phase |
|---|---|---|---|---|
| Cross-tenant read/write | B1, B2, B8 | I, E | `tenant_id` + TenantContext, single authz evaluator, RLS defense in depth, tenant-prefixed S3 keys with signed URLs. **Built in 04–07:** RLS that requires membership on every tenant table, API tests that another organization gets 404/403, storage keys and signed URLs bound to the tenant | 04–07, 42 |
| Privilege escalation via UI bypass or API key | B1 | E | Backend-only checks; scoped keys; agent principals ⊂ user. **Built in 05:** every management endpoint checks the evaluator (direct calls by members get 403); agents are capped by their owner in the evaluator. Not yet: API keys (38), requests made by agents (23) | 05, 23, 38 |
| Malicious upload (malware, zip bomb, parser exploit) | B5 | T, D, E | Quarantine bucket, scan, MIME sniff, size/time limits, sandboxed validator with no egress. **Built in 07 (ADR-026):** closed type list without SVG/HTML/archives/office files, magic-byte sniffing in the API and again in the worker, 25 MB limit checked before and while reading, quarantine bucket, ClamAV in the worker, downloads only after a clean scan as `attachment`, text previews rendered as text, no PDF rendering. Not yet: sandboxed parsers and validators with no egress (12), re-scanning with newer signatures | 07, 12 |
| Prompt injection from retrieved sources | B6 | T, E | AI has no write tools by default; consequential actions need policy + human approval; injection fixtures in evals | 15, 34, 42 |
| Model tool overreach | B2, B6 | E | Least-privilege tool scopes; approvals requestable but not grantable via MCP | 20, 23 |
| OAuth confused deputy / token theft | B2, B7 | S, I | PKCE + state, audience-bound tokens, encrypted token vault, tokens never sent to client. **Built in 08 (ADR-027):** hashed single-use state bound to person and organization, consumed before the code exchange; PKCE S256; code exchanged server-side; tokens sealed per value (AES-256-GCM, tenant and connection as AAD) and unreadable to the API's database role; provider calls only from the worker, only to the provider's API origin; disconnect stops calls at once and revokes at the provider. Not yet: KMS-held keys (44), MCP token audiences (23) | 08, 23 |
| Webhook spoofing / replay / duplicates | B4 | S, T | Signature verification, timestamp window, idempotency keys. **Built in 08:** HMAC-SHA256 over the raw bytes in constant time before any lookup, 5-minute window where the provider sends a timestamp (GitHub does not), `(provider, delivery id)` stored once and, since the 00–09 audit (0012), a body already recorded for the connection refused under a new delivery id, revoked connections refused, 256 KB JSON only. Not yet: per-connection webhook secrets (21); until then a captured body can be posted once to another connection of the same provider | 08, 21, 22, 39 |
| Secrets in agent traces | B3 | I | Redaction before persistence, metadata-only default, content opt-in | 16, 17 |
| Forged telemetry or outcomes | B3 | S, R | Per-installation ingest keys; "observed by" recorded; outcomes only from provider confirmation | 16, 21 |
| Fraudulent identity or ownership claims | B1 | S | Built in 09: domain proofs verified only by the worker after a passed DNS/HTTPS challenge (DB trigger refuses other writers); account proofs by OAuth; claims decided by an owner or admin who did not request them, with reasons and an evidence hash in the audit log; badges derived from evidence with method, date, expiry and "what this does not show"; stale on failed re-check or when another profile proves the same control; ownership changes revoke the old owner's proofs. Ownership or legal identity is never labeled proven. Platform-staff review and abuse reports: 41 | 09, 33, 41 |
| Tampered or stale C2PA media | B5 | T | Official SDK validation; unsigned ≠ fraudulent; stale status on change | 12, 14 |
| Signing-key compromise or misuse | B9 | S, R | KMS, no keys in code/LLM/browser, rotation, revocation, key registry | 10, 20, 36, 42 |
| Untrusted MCP servers / extensions | B2, B7 | E | Curated internal extensions only; manifest scopes; no untrusted code in main process | 40 |
| SSRF via URL import or webhooks out | B7 | I, E | Egress allow-list, block private ranges, fetch in worker. Built in 09 for challenge checks: public addresses only (IPv4 and IPv6 lists), connection pinned to the checked address, HTTPS 443, no redirects, 4 KB and 5 s caps, content never stored | 07, 09, 11, 42 |
| XSS in published/previewed content and embeds | B1 | T, E | Sanitized HTML, CSP, separate-origin embed | 14, 30 |
| Insider misuse | B8 | I, R | Scoped support access with reason, audit of every staff read | 41 |
| Retention/erasure failure | all | I | Documented policy, purge jobs tested, honest receipt-retention exception | 06, 41 |
| Misleading trust messaging (product-level harm) | B1 | — | Closed assurance-label enum, copy review gate (G2, G5) | 14, 31, 42 |
| Cost exhaustion (AI, telemetry flood) | B3, B6 | D | Budgets, rate limits, backpressure, sampling | 15, 16, 43 |
