# Architecture decision log

**Status of this log:** ADR-001 to ADR-012 were **Accepted** by the owner on 2026-11-22 ("accept all"), including every [GUESS] item. They are accepted as design direction only: none is validated by code or tests yet, and each will be revisited in the phase named in the table.
**Version policy:** no library versions are pinned here. The phase that first installs a dependency records the exact version, the official doc URL it was checked against, and the date (CLAUDE.md rule 9).

| ADR | Decision | Alternatives considered | Status | Settled / revisited in |
|---|---|---|---|---|
| ADR-001 | Modular monolith (`apps/api`) + isolated processes for worker, MCP, telemetry, Python AI worker, media validator | Microservices per module; single process for everything | Accepted 2026-11-22 | 01 |
| ADR-002 | Canonical domain model, identity graph as `Subject` + typed `Relation` edges in Postgres | Graph database; per-module schemas | Accepted 2026-11-22 | 06, 13 |
| ADR-003 | Transactional outbox in Postgres as the event bus; Postgres-backed job queue behind a `WorkflowRunner` interface | Kafka/NATS; Temporal from day one; Redis queue | Accepted 2026-11-22 | 06, 07, 35 |
| ADR-004 | Single provider-agnostic AI gateway in the API; Python worker uses it, never providers directly | Direct SDK calls per feature; separate Python gateway | Accepted 2026-11-22 | 15 |
| ADR-005 | C2PA validation in a sandboxed `services/media-validator` using the official CAI SDK | Validate inside API; third-party validation service | Accepted 2026-11-22 | 12 |
| ADR-006 | One signer interface (KMS-backed) and key registry for receipts, credentials and verification records | Per-feature keys; blockchain anchoring | Accepted 2026-11-22 | 10, 14, 20, 36 |
| ADR-007 | Claude integration only via remote MCP server, official hooks collector and opt-in SDK instrumentation | Scraping/claiming Claude account history; browser extension capture | Accepted 2026-11-22 | 17, 18, 23 |
| ADR-008 | Separate telemetry ingest service and store for customer agent telemetry, OTLP-compatible | Store in core tables; vendor observability SaaS | Accepted 2026-11-22 | 16, 43 |
| ADR-009 | All external providers through Origin Connect adapters (OAuth broker, token vault, webhook verifier, outbound delivery) | Each module integrates its own providers | Accepted 2026-11-22 | 08 |
| ADR-010 | Tenancy and authorization: `tenant_id` everywhere, single authz evaluator, RLS as defense in depth | App-only checks; database-per-tenant | Accepted 2026-11-22 | 04, 05, 06 |
| ADR-011 | Seven personas (split org admin into team admin and enterprise admin) | Spec's six | Accepted 2026-11-22 | 00 |
| ADR-012 | Explicit non-goals | — | Accepted 2026-11-22 | 00, revisit at 47 |
| ADR-013 | Import boundaries enforced by a local ESLint rule with a declarative policy table | eslint-plugin-boundaries; dependency-cruiser; overlapping `no-restricted-imports` blocks | Proposed 2026-11-22 (Phase 01) | 01, revisit at 06 |
| ADR-014 | NestJS DI uses explicit `@Inject(Token)` on every constructor parameter | Rely on `emitDecoratorMetadata` (needs SWC/tsc in tests and dev) | Proposed 2026-11-22 (Phase 01) | 01 |
| ADR-015 | Phase 01 toolchain and pinned versions (TypeScript 6.0, ESLint 9, ESM, compiled workspace packages) | TypeScript 7.0; ESLint 10; CommonJS; source-only internal packages | Proposed 2026-11-22 (Phase 01) | 01, revisit at 02 |
| ADR-016 | Add `packages/service-kit` for the shared Fastify bootstrap | Copy the bootstrap into each service | Proposed 2026-11-22 (Phase 01) | 01 |
| ADR-017 | Local stack: Docker Compose with Postgres 18 + pgvector 0.8.7 and SeaweedFS 4.54 as the S3 emulator; apps run on the host | Postgres 16/17; MinIO, RustFS or S3Mock; apps in containers | Proposed 2026-11-22 (Phase 02) | 02, revisit at 07 and 44 |
| ADR-018 | CI on GitHub Actions: SHA-pinned actions, gitleaks binary with checksum, compose-based smoke job, `pnpm audit` + Syft CycloneDX SBOM | gitleaks-action; dependency-review-action; separate Postgres service container | Proposed 2026-11-22 (Phase 02) | 02, revisit at 42 |

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

## ADR-013 — Import boundary enforcement

**Context.** ADR-001 requires lint-enforced boundaries (ARCHITECTURE §4 rules 1–2), verified by a deliberate violation fixture.

**Decision.** One local rule, `originos/boundaries` in `packages/config/eslint/boundaries.mjs`, enabled in the shared flat config. It does path arithmetic on import specifiers against a policy table: database packages only in `apps/api`, `apps/worker`, `packages/db`; no imports of deployables by name; relative imports may not leave their workspace package; another API module only through its `index.ts`; `packages/contracts/src` imports only `zod`.

**Why not the alternatives.** `eslint-plugin-boundaries` 7.4.4 needs an import resolver to classify workspace imports; with NodeNext `.js` specifiers and pnpm symlinks that adds `eslint-import-resolver-typescript` setup for little gain at this size. Several `no-restricted-imports` blocks would silently override each other where globs overlap (flat config replaces rule options). Revisit at Phase 06, when module count grows, if the policy table becomes hard to read.

**Verification.** `packages/config/test/boundaries.test.ts`: unit cases for every policy plus ESLint `lintText` fixtures that must fail (web → db, module → another module's internals) and one that must pass. Manually confirmed on 2026-11-22 that `eslint` in `apps/web` reports the violation alongside Next's own rules.

## ADR-014 — Explicit injection tokens in NestJS

**Context.** Nest's implicit constructor injection depends on `emitDecoratorMetadata`. `tsx` (dev) and Vitest (tests) transpile with esbuild/oxc, which do not emit that metadata, so implicit injection would work in `tsc` builds and fail in tests and dev, or the reverse.

**Decision.** Every constructor parameter in `apps/api` uses `@Inject(Token)` (a class or a `Symbol`). `emitDecoratorMetadata` stays on for `tsc` builds but nothing relies on it. Tests boot the real Nest application (`createApi`) and would fail on a missing token.

## ADR-015 — Toolchain and pinned versions (Phase 01)

Checked 2026-11-22 against the npm registry (published versions, `engines` and `peerDependencies`). Official docs listed for reference; the compatibility decisions below rest on the package metadata.

| Tool | Version | Why this version |
|---|---|---|
| Node.js | ≥ 22.13 (tested 22.23.5) | Vitest 5 needs `^22.12`; ESLint 9 needs `^22.13` |
| pnpm | 10.28.0 | Installed toolchain; pinned via `packageManager` |
| Turborepo | 2.11.13 | Latest 2.x (turborepo.com/docs) |
| TypeScript | 6.0.3 | typescript-eslint 8.73.0 supports `>=4.8.4 <6.1.0`; TypeScript 7.0.2 is not yet supported by it |
| ESLint | 9.39.5 | `eslint-config-next` 16.4.6 pulls `eslint-plugin-react` 7.37.5, whose peer range stops at ESLint 9; ESLint 10 is outside that declared range |
| typescript-eslint | 8.73.0 | Latest |
| Prettier | 3.10.1 | Latest |
| Next.js / eslint-config-next | 16.4.6 | Latest; App Router; Turbopack build |
| React / React DOM | 19.3.1 | Within Next 16 peer range `^19` |
| NestJS (`core`, `common`, `platform-fastify`, `testing`) | 12.6.0 | Latest; `platform-fastify` 12.6.0 depends on Fastify 5.12.8 |
| Fastify | 5.12.8 | Same version Nest's adapter uses, so one Fastify in the tree. Uses `LogController` (top-level `requestIdLogLabel` is deprecated in 5.12) |
| Zod | 4.6.7 | Latest; v4 API (`z.url()`, `z.iso.datetime()`) |
| Drizzle ORM | 0.45.4 (stable) | 1.0 is still RC. `drizzle-kit` is deferred to Phase 06 with the first schema |
| pg / @types/pg | 8.23.1 | node-postgres driver for Drizzle |
| Vitest / Vite | 5.1.1 / 8.3.8 | Vitest 5 declares Vite as a peer |
| tsx | 4.23.15 | Dev watch for Node services |
| @types/node | 22.20.5 | Matches the Node 22 runtime |
| uv / Python | uv 0.11, Python ≥ 3.12 (tested 3.13.18) | `services/ai-worker`; pytest 9.2.0, ruff 0.17.6, hatchling 1.33.0 pinned in `pyproject.toml` and `uv.lock` |

Module system: ESM (`"type": "module"`, `module: NodeNext`) in every TypeScript package. Shared packages compile to `dist/` with declarations; Turborepo builds dependencies first (`dependsOn: ["^build"]`). The web app uses `moduleResolution: Bundler` as Next requires.

Reference docs: nextjs.org/docs, docs.nestjs.com/techniques/performance (Fastify adapter), fastify.dev/docs, orm.drizzle.team/docs, typescript-eslint.io, eslint.org/docs, vitest.dev, turborepo.com/docs, docs.astral.sh/uv.

## ADR-016 — `packages/service-kit`

**Decision.** The Fastify bootstrap shared by the worker's health server, MCP server, telemetry ingest and media validator (redacted logger, correlation IDs as request IDs, `GET /health/live` and `GET /health/ready`, JSON 404) lives in `packages/service-kit`. The API's `FastifyAdapter` uses the same `fastifyBaseOptions`, so logging and correlation behave identically in all processes. It holds no business logic and may not import `@originos/db`.

## ADR-017 — Local development stack

**Decision.** `compose.yaml` runs only infrastructure; app processes run on the host through `pnpm dev` (fast reloads, no image builds). Services: `pgvector/pgvector:0.8.7-pg18-trixie` (PostgreSQL 18.7 with pgvector 0.8.7; an init script enables `vector` and `pgcrypto` and creates `originos_test`), and `chrislusf/seaweedfs:4.54` with its S3 gateway on port 8333 and a static local identity. Both bind to 127.0.0.1 with labeled local-only credentials. No Redis until a measured need (ADR-003).

**Why.** PostgreSQL 18 is the newest major with more than a year of releases (the pgvector image also publishes pg19, released recently); production must use the same major, decided in Phase 44. SeaweedFS is Apache-2.0 licensed, publishes versioned images and implements the S3 API with signed requests (anonymous access returns 403, checked 2026-11-22). The object-storage choice is revisited in Phase 07 when the first S3 client code runs against it.

**Verification (2026-11-22).** `docker compose up -d --wait` → both healthy; `select version()` → PostgreSQL 18.7; extensions `vector 0.8.7`, `pgcrypto 1.4` present in both databases; DB integration tests 3/3; `scripts/smoke.sh` passed. In this cloud sandbox Docker Hub rate-limited anonymous pulls, so the same images were pulled through `mirror.gcr.io` and tagged with their Docker Hub names; `compose.yaml` itself references Docker Hub.

## ADR-018 — Continuous integration

**Decision.** One workflow, `.github/workflows/ci.yml`, on pushes to `main` and on pull requests, with `permissions: contents: read`. Jobs: secret scan (gitleaks 8.30.1 release binary, SHA-256 verified against the release checksum file, full history), Node (frozen install, prettier, lint, typecheck, unit tests, build), Python (uv 0.11.32, ruff, pytest), local stack (`docker compose up --wait`, DB integration tests, seed guard, `scripts/smoke.sh`), and supply chain (`pnpm audit --prod --audit-level high`, CycloneDX SBOM via `anchore/sbom-action` uploaded as an artifact). Every action is pinned to the commit SHA its release tag pointed to on 2026-11-22: `actions/checkout` v7.0.1, `actions/setup-node` v7.1.0, `pnpm/action-setup` v6.1.1, `astral-sh/setup-uv` v10.4.0, `anchore/sbom-action` v0.24.3, `actions/upload-artifact` v7.0.2.

**Why not the alternatives.** `gitleaks-action` needs a license key for organization-owned repositories; the binary works for any owner. `dependency-review-action` needs the dependency graph, which private repositories only get with GitHub Advanced Security; `pnpm audit` works everywhere. Using the compose file in CI (instead of a separate service container) tests the same stack developers run.

**Not yet covered.** Migration checks (no migrations until Phase 06), Python dependency audit (the ai-worker has no runtime dependencies), container image scanning (no images until Phase 44), and turbo remote caching.

**Turborepo env.** Turbo 2 runs tasks in strict env mode, so `turbo.json` lists the runtime variables in `dev.passThroughEnv`; without it `scripts/dev.sh` started the API with no `DATABASE_URL` (found and fixed 2026-11-22).

---

## Official sources to verify when each ADR is settled

Claude Code hooks/memory/skills (code.claude.com/docs), MCP spec and SDKs (modelcontextprotocol.io), CAI SDK (opensource.contentauthenticity.org/docs), Slack Bolt JS (docs.slack.dev/tools/bolt-js), GitHub Apps docs, OpenTelemetry spec, W3C VC Data Model and OID4VC, Stripe test mode, chosen queue library docs. Links are recorded with the date checked; none were checked in Phase 00.
