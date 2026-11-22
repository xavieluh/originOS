# OriginOS threat model — baseline

**Status:** DRAFT v0.1 (Phase 00, 2026-11-22). Baseline only: threats and *planned* controls per trust boundary. No control below is implemented. Full STRIDE per subsystem happens in Phase 42 and must replace "planned" with tested evidence.

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
| Cross-tenant read/write | B1, B2, B8 | I, E | `tenant_id` + TenantContext, single authz evaluator, RLS defense in depth, tenant-prefixed S3 keys with signed URLs | 04–07, 42 |
| Privilege escalation via UI bypass or API key | B1 | E | Backend-only checks; scoped keys; agent principals ⊂ user | 05, 38 |
| Malicious upload (malware, zip bomb, parser exploit) | B5 | T, D, E | Quarantine bucket, scan, MIME sniff, size/time limits, sandboxed validator with no egress | 07, 12 |
| Prompt injection from retrieved sources | B6 | T, E | AI has no write tools by default; consequential actions need policy + human approval; injection fixtures in evals | 15, 34, 42 |
| Model tool overreach | B2, B6 | E | Least-privilege tool scopes; approvals requestable but not grantable via MCP | 20, 23 |
| OAuth confused deputy / token theft | B2, B7 | S, I | PKCE + state, audience-bound tokens, encrypted token vault, tokens never sent to client | 08, 23 |
| Webhook spoofing / replay / duplicates | B4 | S, T | Signature verification, timestamp window, idempotency keys | 08, 21, 22, 39 |
| Secrets in agent traces | B3 | I | Redaction before persistence, metadata-only default, content opt-in | 16, 17 |
| Forged telemetry or outcomes | B3 | S, R | Per-installation ingest keys; "observed by" recorded; outcomes only from provider confirmation | 16, 21 |
| Fraudulent identity or ownership claims | B1 | S | Challenge-based proofs, human review queue, labels with method and date; ownership never "proven" | 09, 33 |
| Tampered or stale C2PA media | B5 | T | Official SDK validation; unsigned ≠ fraudulent; stale status on change | 12, 14 |
| Signing-key compromise or misuse | B9 | S, R | KMS, no keys in code/LLM/browser, rotation, revocation, key registry | 10, 20, 36, 42 |
| Untrusted MCP servers / extensions | B2, B7 | E | Curated internal extensions only; manifest scopes; no untrusted code in main process | 40 |
| SSRF via URL import or webhooks out | B7 | I, E | Egress allow-list, block private ranges, fetch in worker | 07, 11, 42 |
| XSS in published/previewed content and embeds | B1 | T, E | Sanitized HTML, CSP, separate-origin embed | 14, 30 |
| Insider misuse | B8 | I, R | Scoped support access with reason, audit of every staff read | 41 |
| Retention/erasure failure | all | I | Documented policy, purge jobs tested, honest receipt-retention exception | 06, 41 |
| Misleading trust messaging (product-level harm) | B1 | — | Closed assurance-label enum, copy review gate (G2, G5) | 14, 31, 42 |
| Cost exhaustion (AI, telemetry flood) | B3, B6 | D | Budgets, rate limits, backpressure, sampling | 15, 16, 43 |
