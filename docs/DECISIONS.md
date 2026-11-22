# Architecture decision log

**Status of this log:** every ADR below is **Proposed** (Phase 00 draft, 2026-11-22). None is Accepted until the owner reviews it. No decision has been validated by code or tests yet. Items tagged **[GUESS]** have no source in MASTER_SPEC and need confirmation.
**Version policy:** no library versions are pinned here. The phase that first installs a dependency records the exact version, the official doc URL it was checked against, and the date (CLAUDE.md rule 9).

| ADR | Decision | Alternatives considered | Status | Settled / revisited in |
|---|---|---|---|---|
| ADR-001 | Modular monolith (`apps/api`) + isolated processes for worker, MCP, telemetry, Python AI worker, media validator | Microservices per module; single process for everything | Proposed | 01 |
| ADR-002 | Canonical domain model, identity graph as `Subject` + typed `Relation` edges in Postgres | Graph database; per-module schemas | Proposed | 06, 13 |
| ADR-003 | Transactional outbox in Postgres as the event bus; Postgres-backed job queue behind a `WorkflowRunner` interface | Kafka/NATS; Temporal from day one; Redis queue | Proposed | 06, 07, 35 |
| ADR-004 | Single provider-agnostic AI gateway in the API; Python worker uses it, never providers directly | Direct SDK calls per feature; separate Python gateway | Proposed | 15 |
| ADR-005 | C2PA validation in a sandboxed `services/media-validator` using the official CAI SDK | Validate inside API; third-party validation service | Proposed | 12 |
| ADR-006 | One signer interface (KMS-backed) and key registry for receipts, credentials and verification records | Per-feature keys; blockchain anchoring | Proposed | 10, 14, 20, 36 |
| ADR-007 | Claude integration only via remote MCP server, official hooks collector and opt-in SDK instrumentation | Scraping/claiming Claude account history; browser extension capture | Proposed | 17, 18, 23 |
| ADR-008 | Separate telemetry ingest service and store for customer agent telemetry, OTLP-compatible | Store in core tables; vendor observability SaaS | Proposed | 16, 43 |
| ADR-009 | All external providers through Origin Connect adapters (OAuth broker, token vault, webhook verifier, outbound delivery) | Each module integrates its own providers | Proposed | 08 |
| ADR-010 | Tenancy and authorization: `tenant_id` everywhere, single authz evaluator, RLS as defense in depth | App-only checks; database-per-tenant | Proposed | 04, 05, 06 |
| ADR-011 | Seven personas (split org admin into team admin and enterprise admin) | Spec's six | Proposed | 00 |
| ADR-012 | Explicit non-goals | — | Proposed | 00, revisit at 47 |

---

## ADR-001 — Modular monolith with isolated side processes

**Context.** 15 product modules share identity, objects, permissions, audit and integrations (CLAUDE.md "Product scope"; MASTER_SPEC §4 "grow into microservices only with measured need"). One builder, staged phases.

**Decision.** All business logic lives in `apps/api` as NestJS modules grouped into seven bounded contexts (Core, Trust, Content, Evidence, Agents, Connect, Platform; see ARCHITECTURE §5). Separate deployables exist only where isolation is the point:
- `apps/worker` — same code, different entrypoint; async jobs and outbox dispatch. **[GUESS: added; not in Phase 01's scaffold list]**
- `apps/mcp-server` — external AI client trust boundary; no DB access.
- `services/telemetry` — high-volume untrusted ingest.
- `services/ai-worker` — Python document/ML tooling.
- `services/media-validator` — hostile file parsing. **[GUESS: added]**

Module boundaries are enforced by import-boundary lint rules (Phase 01) and by forbidding cross-module table access.

**Consequences.** One deploy, one migration stream, simple transactions across modules. Risk: modules erode into a ball of mud, mitigated by lint rules and the event-first rule for side effects. Extraction path: any context can later move out because it already communicates through interfaces and events.

**Verification.** Phase 01: boundary lint fails on a deliberate violation fixture. Phase 06: no query in module A references module B's schema (static check).

## ADR-002 — Canonical domain model and identity graph

**Context.** The kit uses three different vocabularies (MASTER_SPEC §3, the §2 module table, PRODUCT_MAP). Duplicated entities would violate CLAUDE.md rule 3.

**Decision.**
1. MASTER_SPEC §3 entity names are canonical. Module-specific terms are aliases:

| Module term | Canonical |
|---|---|
| Agent, AgentIdentity | `Subject(kind=agent)` (+ Registry entry) |
| CreatorProfile | `Subject(kind=human)` profile projection |
| Issuer, Publisher (registry) | `Subject(kind=organization|service)` with an issuer/publisher role |
| Run / Span / Action | `AgentRun` / `AgentEvent` / `ToolAction` |
| ExecutionReceipt | `Receipt` (signed, ADR-006) |
| Attestation | a `ProvenanceAssertion` that carries a validated signature (UI term only) |
| Artifact | `Asset` (stored bytes) or an external reference on a `Relation` |
| Draft, DraftVersion | `Work` / `WorkVersion` with `status=draft` |
| Paper | `Source(kind=paper)` |
| Derivation | `Relation(type=DERIVED_FROM)` |
| LicenseClaim | `LicenseDeclaration` |
| Connection, OAuthGrant | `ProviderConnection` (+ grant rows) |
| LibraryItem | membership of a `Source` or `Work` in a `Collection` |

2. **Identity graph = `Subject` + `IdentityClaim` + `Relation`.** Every actor (human, org, agent, service) is a Subject. Claims about a Subject (controls domain X, is GitHub user Y) are `IdentityClaim` rows with evidence and an assurance label. Links between anything are rows in one typed `Relation` table: `(id, tenant_id, type, from_id, to_id, asserted_by, observed_by, method, validation, confidence_note, valid_from, superseded_by, revoked_at, created_at)`. Allowed `(type, from_kind, to_kind)` triples are whitelisted in a constraint table, which blocks forbidden edge types (Phase 06 task). Inference-generated edges carry `method=inferred` and are reviewable.
3. Relational graph in Postgres first; recursive CTEs with depth and row limits for traversal (Phase 13). No graph DB until measured need.
4. Assurance labels are a closed enum of the seven MASTER_SPEC §3 values. No aggregate trust score.

**Consequences.** One place to reason about provenance; cheap joins to domain rows. Risk: deep traversals get slow, mitigated by bounds and Phase 43 load tests.

**Verification.** Phase 06: forbidden edge insert fails; orphan prevention via FKs. Phase 13: cycle handling and tenant-visibility tests.

## ADR-003 — Event bus and durable work

**Context.** Spec requires an outbox, idempotency, retries, cancellation and approval-wait states; engine "chosen by ADR … Temporal if long-lived complex workflows justify it".

**Decision.**
- **Event bus:** transactional outbox table in Postgres, written in the same transaction as the domain change. Envelope: `event_id, tenant_id, type, schema_version, subject_ref, payload, correlation_id, causation_id, occurred_at`. Consumers record `(event_id, consumer)` to process each event once logically.
- **Jobs and workflows:** **[GUESS]** a Postgres-backed queue library (candidates: pg-boss, Graphile Worker; pick and pin in Phase 07 after checking current docs) behind an internal `WorkflowRunner` interface. Human waits (approvals) are database state plus a resume event, not a sleeping job.
- **Redis:** not used until a measured need (rate limiting at scale, caching).
- **Temporal:** re-evaluate at Phase 35 against concrete Automations requirements (long-running multi-step workflows with versioning).

**Consequences.** No extra infrastructure for G1. Throughput ceiling of a Postgres queue is acceptable at pilot scale (to be measured in Phase 43).

**Verification.** Phase 06: event survives simulated worker outage, processed once logically under retries. Phase 07: duplicate publish impossible under retry. Phase 35: workflow resumes after worker crash.

## ADR-004 — Provider-agnostic AI gateway

**Decision.** One gateway module in the API (Platform context) is the only code that holds model-provider credentials and makes model calls. It provides: provider adapters, routing by capability/latency/privacy/budget, structured-output schemas, retries, outage → queued state, metering (tokens/cost where the provider exposes them), per-workspace prompt/output retention policy, secret redaction, human-review flags. The Python AI worker calls the gateway over an internal authenticated endpoint. AI outputs are stored as *assessments or suggestions with their inputs*, never as facts or proof. **[GUESS]** first provider adapter is Anthropic's API (the build is Claude-centric); a second adapter (or a local OpenAI-compatible endpoint) exists in tests to prove swapability.

**Verification.** Phase 15: provider swap in tests; outage yields recoverable queued state; eval fixture suite for hallucination-prone tasks.

## ADR-005 — C2PA validation

**Decision.** C2PA manifests are validated in `services/media-validator` using the official Content Authenticity Initiative SDK (binding choice, Rust or Node, made in Phase 12 against current docs at opensource.contentauthenticity.org). The service has no network egress, runs with CPU/memory/time limits and receives files from the quarantine bucket via the worker. Output is machine-readable diagnostics mapped to: `valid`, `invalid` (tampered/binding broken), `unsigned` (shown as *unverified*, never *fraudulent*), `unsupported`, `error`. Signer trust is explained separately from validity. Self-asserted AI-use and author fields inside a manifest are shown as *asserted by signer*, not as verified authorship.

**Verification.** Phase 12 fixtures: known-good, tampered, unsigned, unsupported. UI copy test: the string "human-authored guaranteed" (and similar) never appears.

## ADR-006 — Signing, receipts and key registry

**Context.** Signing is needed for credentials (10), verification receipts (14), execution receipts (20) and registry attestations (36).

**Decision.** `packages/signing` defines a `Signer` interface (`sign(digest, keyRef)`, `publicKey(keyRef)`) with a KMS adapter for staging/production and a **dev-only** file signer that refuses to start when `NODE_ENV=production`. Keys never reach the browser, the LLM, logs or the repository. A key registry (Trust context, surfaced by Origin Registry) records key ID, owner Subject, algorithm, validity window, rotation and revocation, so historical receipts stay verifiable after rotation. Receipts sign a canonicalized JSON payload of hashes and IDs, not raw private content. **[GUESS]** algorithm Ed25519 where KMS supports it, otherwise ECDSA P-256; canonicalization via RFC 8785 (JCS). No blockchain anchoring.

**Verification.** Phase 20: receipt tamper test fails validation. Phase 36: revoked issuer changes verification result; rotated key still verifies old receipts. Phase 42: secret scan finds no keys in code.

## ADR-007 — Claude integration boundaries

**Decision.** OriginOS integrates with Claude in exactly three ways, each with explicit coverage labels:
1. **Remote MCP server** — OriginOS tools callable from Claude, using the current official MCP SDK and its authorization spec; tokens audience-bound to the MCP server and tenant-bound; read tools return source-linked records; approval tools may *request* but never *grant*.
2. **Claude Code hook collector** — opt-in, locally installed, captures only documented hook event types; file contents and secrets redacted by default; user can disable; offline buffer.
3. **Instrumentation SDK** — for Claude API / Agent SDK apps that explicitly instrument requests and tools.

OriginOS never claims access to private Claude conversation history or to agent activity that was not instrumented. Unknown coverage is shown as unknown.

**Verification.** Phases 17, 18, 23 checks; UI copy review in Phase 42.

## ADR-008 — Agent telemetry pipeline

**Decision.** `services/telemetry` accepts authenticated OTLP-compatible and custom events with per-installation ingest keys, validates schema version, redacts per policy before persistence, deduplicates on `(installation, event_id)`, applies backpressure and sampling, and writes to a telemetry store separate from core tables. **[GUESS]** start with time-partitioned Postgres tables in a `telemetry` schema; move to a columnar store (e.g. ClickHouse) only if Phase 43 load tests show need. OriginOS's own operational telemetry is a different pipeline (standard OTEL exporter), so customer data and ops data never mix.

**Verification.** Phase 16: replay does not duplicate logical actions; tenant isolation on ingest; redaction in logs and UI.

## ADR-009 — Origin Connect integration broker

**Decision.** One broker owns provider connections: adapter registry with capabilities and granted scopes, OAuth authorization code + PKCE where supported, state/nonce replay defense, tokens encrypted with envelope encryption, rotation and revocation, inbound webhook signature verification + replay window + idempotency, outbound delivery with retries. Status is one of NOT CONFIGURED / CONNECTED / DEGRADED / REVOKED and is truthful. A fake provider server exists only in tests. Marketplace extensions (Phase 40) declare scopes in a manifest and use the same broker.

**Verification.** Phase 08 checks; Phase 21, 22, 30 reuse the broker (no second token store — static check).

## ADR-010 — Tenancy and authorization

**Decision.** Tenant = organization; workspaces within it **[GUESS: one workspace per org at first, model allows many]**. Every tenant-owned row has `tenant_id`; repositories require a `TenantContext`. One authorization evaluator: RBAC roles + resource-scoped grants + explicit deny, actor types human/service/agent, actions read/write/publish/export/admin. Agent principals default to a strict subset of the owning user's permissions. **[GUESS, recommended]** Postgres row-level security keyed on a per-transaction `app.tenant_id` setting as defense in depth. Auth provider (OIDC, passkeys/MFA) is chosen in Phase 04 against current docs and recorded here.

**Verification.** Phase 04/05: cross-org access impossible in tests even with UI bypassed; role change produces an audit event. Phase 42: automated cross-tenant red-team suite.

## ADR-011 — Personas

**Decision.** Seven personas per prompt 00: creator, reader, researcher, editor/publisher, developer/AI engineer, team admin, enterprise admin. MASTER_SPEC's "organization admin" covers both admin personas; they are split because their scopes differ (single workspace vs multi-workspace policy, retention, legal hold). Details in ARCHITECTURE §2.

## ADR-012 — Non-goals

Not in scope: blockchain/tokens; AI-text detection; any aggregate trust score or "100% human" seal; reading private Claude history or uninstrumented agent activity; enforcement over agents that do not route through OriginOS; legal ownership determinations (rights are claims with evidence); paywall bypass or unconsented scraping; per-module microservices; real-time co-editing unless Phase 28 proves need; self-hosted inference at launch; running untrusted marketplace code in the main process; purchasable verification outcomes (MASTER_SPEC §10).

---

## Official sources to verify when each ADR is settled

Claude Code hooks/memory/skills (code.claude.com/docs), MCP spec and SDKs (modelcontextprotocol.io), CAI SDK (opensource.contentauthenticity.org/docs), Slack Bolt JS (docs.slack.dev/tools/bolt-js), GitHub Apps docs, OpenTelemetry spec, W3C VC Data Model and OID4VC, Stripe test mode, chosen queue library docs. Links are recorded with the date checked; none were checked in Phase 00.
