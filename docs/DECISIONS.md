# Architecture decision log

**Status of this log:** ADR-001 to ADR-012 were **Accepted** by the owner on 2026-11-22 ("accept all"), including every [GUESS] item. ADR-013 to ADR-018 (Phases 01–02) were accepted on 2026-11-22 when the owner merged PRs #2 and #3 and asked for no changes before Phase 03. ADR-019 to ADR-021 (Phase 03) and ADR-022 to ADR-023 (Phase 04) were accepted by the owner on 2026-11-22, during Phase 04. ADR-024 (Phase 05) was accepted by the owner on 2026-11-22, before merge. ADR-025 (Phase 06) and ADR-026 (Phase 07) were accepted by the owner on 2026-11-22. They are accepted as design direction only: none is validated by code or tests yet, and each will be revisited in the phase named in the table.
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
| ADR-013 | Import boundaries enforced by a local ESLint rule with a declarative policy table | eslint-plugin-boundaries; dependency-cruiser; overlapping `no-restricted-imports` blocks | Accepted 2026-11-22 (Phase 01) | 01, revisit at 06 |
| ADR-014 | NestJS DI uses explicit `@Inject(Token)` on every constructor parameter | Rely on `emitDecoratorMetadata` (needs SWC/tsc in tests and dev) | Accepted 2026-11-22 (Phase 01) | 01 |
| ADR-015 | Phase 01 toolchain and pinned versions (TypeScript 6.0, ESLint 9, ESM, compiled workspace packages) | TypeScript 7.0; ESLint 10; CommonJS; source-only internal packages | Accepted 2026-11-22 (Phase 01) | 01, revisit at 02 |
| ADR-016 | Add `packages/service-kit` for the shared Fastify bootstrap | Copy the bootstrap into each service | Accepted 2026-11-22 (Phase 01) | 01 |
| ADR-017 | Local stack: Docker Compose with Postgres 18 + pgvector 0.8.7 and SeaweedFS 4.54 as the S3 emulator; apps run on the host | Postgres 16/17; MinIO, RustFS or S3Mock; apps in containers | Accepted 2026-11-22 (Phase 02) | 02, revisit at 07 and 44 |
| ADR-018 | CI on GitHub Actions: SHA-pinned actions, gitleaks binary with checksum, compose-based smoke job, `pnpm audit` + Syft CycloneDX SBOM | gitleaks-action; dependency-review-action; separate Postgres service container | Accepted 2026-11-22 (Phase 02) | 02, revisit at 42 |
| ADR-019 | Design system: Tailwind CSS 4 over TypeScript tokens | see ADR text | Accepted 2026-11-22 (Phase 03) | 03 |
| ADR-020 | Typography (Fraunces, Inter, JetBrains Mono, self-hosted) and lucide icons | Font CDN (see ADR text) | Accepted 2026-11-22 (Phase 03) | 03 |
| ADR-021 | Browser tests: Playwright, axe and visual baselines in a pinned container | Host-rendered baselines (see ADR text) | Accepted 2026-11-22 (Phase 03) | 03, updated 04 |
| ADR-022 | Authentication: Better Auth 1.7.27 in the API (email+password, verification, reset, TOTP, passkeys) behind a same-origin proxy | Hosted IdP; Auth.js; hand-rolled | Accepted 2026-11-22 (Phase 04) | 04, revisit at 05 and 42 |
| ADR-023 | Tenancy: `core` schema, non-superuser app role, row-level security that requires membership | App-only checks; Better Auth organization plugin | Accepted 2026-11-22 (Phase 04) | 04, revisit at 05, 06 and 42 |
| ADR-024 | Authorization: one pure evaluator (`packages/authz`) for roles, resource-scoped grants and explicit deny; agents capped by their owner; consent records with history | Policy engine (OPA/Cedar/Casbin); permission checks per module; roles only | Accepted 2026-11-22 (Phase 05) | 05, revisit at 06, 16 and 42 |
| ADR-025 | Canonical domain schema: opaque prefixed ids, one Postgres schema per context, object registry with typed relation whitelist, append-oriented writes, hash-chained audit log, transactional outbox with a separate worker role, down migrations | Graph DB; generic JSON objects; polymorphic edges without FKs; message broker | Accepted 2026-11-22 (Phase 06) | 06, revisit at 13, 20, 41 and 44 |
| ADR-026 | Ingestion and jobs: S3-compatible storage with quarantine and files buckets, content sniffing, ClamAV scanning in the worker, one-minute signed URLs; a Postgres job runner under row-level security with steps, retries, dead-letter, cancel and human waits, mapped onto Temporal | pg-boss; graphile-worker; Temporal now; scanning in the API; serving files through the API | Accepted 2026-11-22 (Phase 07) | 07, revisit at 08, 21 and 44 |

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

**Decision.** Tenant = organization; workspaces within it **[GUESS: one workspace per org at first, model allows many]**. Every tenant-owned row has `tenant_id`; repositories require a `TenantContext`. One authorization evaluator: RBAC roles + resource-scoped grants + explicit deny, actor types human/service/agent, actions read/write/publish/export/admin. Agent principals default to a strict subset of the owning user's permissions. **[GUESS, recommended]** Postgres row-level security keyed on a per-transaction `app.tenant_id` setting as defense in depth. Auth provider (OIDC, passkeys/MFA) is chosen in Phase 04 against current docs and recorded here. **Phase 04:** authentication is ADR-022 (Better Auth); tenancy enforcement is ADR-023 (RLS that requires membership, not just a tenant setting).

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

**Windows (2026-11-22).** Package scripts must run under cmd.exe, which pnpm uses on Windows: environment variables are set with `cross-env` 10.1.0 (latest release, September 2025; `apps/web` devDependency) and globs are double-quoted, never single-quoted. `scripts/*.sh` stay Bash and run in Git Bash; they stop early with a clear message when Docker Desktop is not running. Tested on Linux only; the owner's Windows machine is the first Windows run.

## ADR-018 — Continuous integration

**Decision.** One workflow, `.github/workflows/ci.yml`, on pushes to `main` and on pull requests, with `permissions: contents: read`. Jobs: secret scan (gitleaks 8.30.1 release binary, SHA-256 verified against the release checksum file, full history), Node (frozen install, prettier, lint, typecheck, unit tests, build), Python (uv 0.11.32, ruff, pytest), local stack (`docker compose up --wait`, DB integration tests, seed guard, `scripts/smoke.sh`), and supply chain (`pnpm audit --prod --audit-level high`, CycloneDX SBOM via `anchore/sbom-action` uploaded as an artifact). Every action is pinned to the commit SHA its release tag pointed to on 2026-11-22: `actions/checkout` v7.0.1, `actions/setup-node` v7.1.0, `pnpm/action-setup` v6.1.1, `astral-sh/setup-uv` v10.4.0, `anchore/sbom-action` v0.24.3, `actions/upload-artifact` v7.0.2.

**Why not the alternatives.** `gitleaks-action` needs a license key for organization-owned repositories; the binary works for any owner. `dependency-review-action` needs the dependency graph, which private repositories only get with GitHub Advanced Security; `pnpm audit` works everywhere. Using the compose file in CI (instead of a separate service container) tests the same stack developers run.

**Not yet covered.** Migration checks (no migrations until Phase 06), Python dependency audit (the ai-worker has no runtime dependencies), container image scanning (no images until Phase 44), and turbo remote caching.

**Turborepo env.** Turbo 2 runs tasks in strict env mode, so `turbo.json` lists the runtime variables in `dev.passThroughEnv`; without it `scripts/dev.sh` started the API with no `DATABASE_URL` (found and fixed 2026-11-22).

---

## ADR-019 — Design system: Tailwind CSS 4 over TypeScript tokens (Phase 03)

**Status.** Accepted 2026-11-22 (proposed in Phase 03; accepted by the user during Phase 04).

**Decision.** Design tokens live in `packages/ui/src/tokens.ts` (colours for light and dark, fonts, radii, motion). `packages/ui` builds them into `dist/tokens.css` as `--oo-*` custom properties (`:root`, `[data-theme="dark"]`, and `prefers-color-scheme: dark` unless `data-theme="light"`). The web app uses Tailwind CSS 4.3.5 via `@tailwindcss/postcss` 4.3.5, mapping the variables in an `@theme inline` block, and scans `packages/ui/src` with `@source`. Components in `packages/ui` are plain React with Tailwind classes; they take a `linkComponent` instead of importing Next. Pure helpers (`theme.ts`, `commands.ts`, `nav.ts`) sit outside `"use client"` modules so server code can import them. Versions were the latest on npm on 2026-11-22.

**Why.** CLAUDE.md names Tailwind and a shared accessible design system. Keeping tokens in TypeScript lets a unit test check WCAG contrast for every text pair (4.5:1) and UI pair (3:1) in both themes (`packages/ui/test/contrast.test.ts`), so a colour change that breaks contrast fails CI.

**Guardrails built in.** `Button` needs an `action` name and a behaviour (click handler, submit or link); a disabled button must carry a visible reason. `NotYetAvailable` renders no controls. Dark mode follows the system unless the person picks Light or Dark (stored in `localStorage` under `originos-theme`, applied before paint by a fixed inline script).

## ADR-020 — Typography and icons (Phase 03)

**Status.** Accepted 2026-11-22 (proposed in Phase 03; accepted by the user during Phase 04).

**Decision.** Fraunces (display), Inter (body) and JetBrains Mono (IDs, hashes, timestamps), self-hosted through `@fontsource-variable/*` 5.3.0; icons from `lucide-react` 1.77.0. Icons are decorative (`aria-hidden`) and always sit next to text.

**Why.** Self-hosting avoids a runtime request to a font CDN (privacy, no third-party dependency, deterministic screenshots). All three fonts are under the SIL Open Font License; lucide is ISC.

## ADR-021 — Browser tests: Playwright, axe and visual baselines in a pinned container (Phase 03)

**Status.** Accepted 2026-11-22 (proposed in Phase 03; accepted by the user during Phase 04).

**Decision.** `apps/web/e2e` runs with `@playwright/test` 1.65.1 and `@axe-core/playwright` 4.14.0 against a production build (`next start` on port 3100, API pointed at a closed port so status must read "Unreachable"). Suites: every nav route resolves and shows its "not yet available" cards; every `<button>` has a `data-action` from an allowlist and every link resolves; axe (WCAG 2.0/2.1/2.2 A and AA plus best practice) on every route in light and dark; keyboard (skip link, focus outline, ⌘K/Ctrl+K command bar, theme radios, drawer, mobile nav); and visual screenshots at 390, 820 and 1440 px plus dark. Visual baselines are generated and checked in `mcr.microsoft.com/playwright:v1.65.1-noble` (`scripts/e2e-docker.sh`), and the CI job `web-e2e` runs in the same image, so font rendering matches.

**Why.** Screenshots differ across operating systems and browser builds; one pinned image for both makes the baselines meaningful. Unit tests can't see layout, focus or computed contrast, so the acceptance checks need a real browser.

**Phase 04 update.** Workspace pages now require a signed-in member, so the suite runs against the built API with a real Postgres (`originos_test`, migrated on start) and Mailpit, instead of a closed API port. A setup project signs a person up through the UI and the real verification email and saves the session; signed-out suites clear it. The browser uses `http://localhost:3100` because passkeys need a hostname. The "API unreachable" state stays covered by unit tests of `describeApi`.

## ADR-022 — Authentication: Better Auth in the API (Phase 04)

**Status.** Accepted 2026-11-22 (proposed in Phase 04; accepted by the owner before merge).

**Decision.** `better-auth` 1.7.27 with `@better-auth/drizzle-adapter` 1.7.27 and `@better-auth/passkey` 1.7.27 (newest releases on npm when checked on 2026-11-22), mounted in `apps/api` at `/api/auth/*`; the web app reaches it only through a same-origin proxy route (`apps/web/src/app/api/auth/[...all]/route.ts`), so the session cookie is first-party and httpOnly. Enabled: email + password (scrypt, 12–128 characters, email verification required before sign-in, reset by email with a 1-hour token that revokes all sessions), TOTP two-step verification with single-use backup codes, and passkeys (WebAuthn; relying-party ID = hostname of `ORIGINOS_PUBLIC_URL`). Sessions: 7 days, renewed daily while used, "fresh" for 15 minutes for sensitive changes; cookie prefix `originos`, `Secure` on https. Mail goes through nodemailer 10.6.1 over `SMTP_URL`; without it the mailer reports "not configured" and sign-up, reset and invitations show a setup-required state. Telemetry off.

**Security notes.** Better Auth skips its origin/CSRF checks when it detects a test runner, so `disableOriginCheck: false` and `disableCSRFCheck: false` are pinned and tests exercise the production behaviour. It checks Origin when cookies are present and Fetch Metadata otherwise. Our own API routes add a global guard: unsafe methods need `Origin` equal to the public origin and a JSON body, then a valid session (deny by default; only health, `/v1/auth-config` and the auth endpoints are public). Session tokens never reach browser JavaScript: the session list is fetched server-side and stripped to ids. Forms are disabled until hydrated and use POST, so an early submit cannot put a password in a URL (found during Phase 04 testing). Per-IP rate limits are on (30 requests/minute window plus Better Auth's stricter sign-in rules); `AUTH_RATE_LIMIT=off` exists for browser test runs and is refused in production. The API trusts `x-forwarded-for` for client addresses: production must put it behind a proxy that overwrites that header (Phase 44). `pnpm audit` reports one moderate advisory in esbuild reached through better-auth's optional drizzle-kit dependency; it affects esbuild's dev server, which the API never runs. Better Auth has had security advisories before: pin exact versions, read the release notes on every upgrade and re-run the auth integration suite.

**Why not the alternatives.** A hosted identity provider (Auth0, Clerk, WorkOS, Cognito) would add a paid external dependency and an account the owner hasn't approved; OIDC sign-in with external providers can be added later through Origin Connect (ADR-009) without changing sessions. Auth.js focuses on OAuth providers and leaves passwords, TOTP and passkeys to the app. Hand-rolling password and WebAuthn handling is the riskiest option. Better Auth's own organization plugin was not used: tenancy needs row-level security and our audit log (ADR-023).

**Not done yet.** OIDC/social sign-in, enterprise SSO (SAML/OIDC per org), account deletion with retention rules (Phase 05 consent and retention), "breached password" checks, and a production email provider (**BLOCKED** on the owner choosing one and supplying `SMTP_URL`).

## ADR-023 — Tenancy enforcement: core schema, application role and row-level security (Phase 04)

**Status.** Accepted 2026-11-22 (proposed in Phase 04; accepted by the owner before merge). Implements ADR-010's tenancy half; the authorization evaluator is Phase 05.

**Decision.** A `core` Postgres schema holds accounts (Better Auth's tables), `organizations` (tenant id = organization id), `memberships` (owner/admin/member; exactly one owner per organization by partial unique index), `invitations` (lowercased email, invited role, SHA-256 token hash, 7-day expiry, accepted/revoked state) and an append-only `audit_events` table. Migrations are generated by drizzle-kit 0.31.11 from `packages/db/src/schema.ts`; row-level security is a hand-written migration (`0001_core_rls.sql`). Services connect as the schema owner but every pooled connection runs as `originos_app` (a NOLOGIN, non-superuser, NOBYPASSRLS role) via the `role` startup parameter, so if the role cannot be assumed the connection fails instead of running as the owner. Each request runs in a transaction that sets `app.user_id`, `app.tenant_id` and, for invitations, `app.invitation_token_hash`. Policies never trust `app.tenant_id` alone: rows are visible only when the user is a member (`core.member_role`, SECURITY DEFINER), management needs owner or admin, a new membership is possible only as the first owner of an organization you just created or by a valid, unexpired, unrevoked invitation addressed to your verified email with the invited role, and ownership moves only through `core.transfer_ownership()`. The application role cannot update or delete audit events. A new session opens in the organization the person used most recently.

**Why.** CLAUDE.md requires tenant isolation in the backend and storage. Database-enforced policies mean an application bug that sets the wrong tenant still cannot read or write another organization (tested directly against Postgres). Separate tables (not Better Auth's organization plugin) keep tenancy under the same RLS and audit rules every later module will use.

**Verification (2026-11-22).** `packages/db` RLS integration tests 15/15 (role is not superuser, fails closed, forged tenant id reveals nothing, non-members cannot join or invite, invitation token, email, role and expiry are enforced by the database, single owner, audit log append-only); `apps/api` integration tests 16/16; Playwright journeys in ADR-021.

## ADR-024 — Authorization: one evaluator, grants, explicit deny and consent (Phase 05)

**Status.** Accepted 2026-11-22 (proposed in Phase 05; accepted by the owner before merge). Implements ADR-010's authorization half on top of ADR-023.

**Decision.** `packages/authz` (new, no runtime dependencies) is the only place permission rules live. `evaluate(actor, action, resource)` is pure and deterministic. Callers load the actor's role and live grants for one organization and pass them in.
- **Vocabulary.** Actor types are human, service and agent. Actions are read, write, publish, export and admin. Resource types so far are organization, members, invitations, audit_log, grants, agents and consents; later phases append to this list rather than inventing their own checks.
- **Roles.** Owner has every action. Admin manages members, invitations, grants and agents, sets consent policies, reads and exports the audit log, and can change the organization but never own it (no organization admin). Member reads the organization, the roster, agents and consent policies. Anything not listed is denied.
- **Evaluation order.** Explicit deny, then membership, then role, then allow grant, then resource ownership (people may read and change agents they own). Deny by default.
- **Grants** (`core.permission_grants`). Each grant names a subject (user or agent; service is reserved for API credentials), an effect, one resource type or `*`, an optional resource id, actions, a reason and an expiry. Grants are revoked, never edited or deleted. The application role has column-level UPDATE on `revoked_at`/`revoked_by` only.
- **Escalation rules** (`checkGrant`, plus database policy where it can be expressed):
  - only holders of grants admin may grant;
  - an allow grant may hand on only actions the grantor holds;
  - organization admin is never grantable (also a database CHECK in the insert policy);
  - nobody can deny the owner;
  - nobody grants to, or revokes a grant on, themselves;
  - subjects must belong to the organization (database function).
- **Allow grants to people cover the audit log only** for now. Row-level security still keeps member, invitation, grant and settings management to owners and admins, so an allow grant there would pass the API and then fail in Postgres. Denies and agent grants have no such limit. Revisit when Phase 06 adds domain resources.
- **Agents** (`core.agents`). Each agent has an accountable owner and is disabled, never deleted. Its permissions are the intersection of its own (default: read the organization; plus grants) with its owner's current permissions. It can never take admin actions and stops when disabled or when the owner leaves.
- **Agents cannot authenticate yet.** Phase 05 registers them and computes their permissions for display and for later callers. Agent credentials and enforcement on agent traffic arrive with AgentTrust and the MCP server (Phases 16–18). Enforcement only covers actions routed through those controls (CLAUDE.md rule 7).
- **API.** A `@RequirePermission(action, resourceType)` decorator replaces role lists in the global guard. The guard re-reads the membership and live grants on every request. Refusals are 403 with `{ error: "forbidden", reason }` (for example `explicit_deny` or `no_permission`). Grant and consent changes write `grant.*`, `agent.*` and `consent.*` audit events.
- **Consent** (`core.consents`).
  - Personal records are visible only to the person; organization policies are visible to members and set by owners and admins.
  - Purposes: identity_directory, telemetry_collection, data_sharing, provider_scopes and cross_org_policy, each with a scope key where needed (provider, partner organization) and the wording version agreed to.
  - Revoking keeps the row; giving consent again adds a new one. A partial unique index allows one active record per subject, purpose and scope.
  - Recording consent turns nothing on by itself: the modules that need it check for an active record before acting.
  - Personal consent changes appear in the organization audit log (purpose only, no other details), so administrators can show that telemetry or sharing was consented to.

**Why not the alternatives.** A policy engine (OPA, Cedar, Casbin) adds a language and a runtime for rules that fit in about 150 lines of tested TypeScript today. The evaluator's interface (actor, action, resource → decision with reason) maps onto one if the rules outgrow it. Checks per module would drift; roles alone cannot express agent caps or explicit deny.

**Verification (2026-11-22).**
- `packages/authz` unit tests: 16/16 (deny by default, explicit deny beats role and wildcard, resource-scoped grants, expiry and revocation, services grant-only, agent defaults strictly narrower than the owner for every role, agent capped and never admin, `checkGrant` refusals).
- `packages/db` RLS integration tests: 23/23, including 8 new ones for agents, grants and consents.
- `apps/api` integration tests: 29/29, including 13 new ones (role-change audit, members bypassing the UI get 403 on 9 management calls, explicit deny and self-lift refusal, escalation refusals, agent cap, consent give/inspect/revoke/history).
- Playwright: 128/128, including 3 new journeys.

## ADR-025 — Canonical domain schema, object registry, ledger and outbox (Phase 06)

**Status.** Accepted 2026-11-22 (proposed in Phase 06; accepted by the owner after merge). Implements ADR-002 and the outbox half of ADR-003 on top of ADR-023/024. No new dependencies: the worker adds `drizzle-orm` 0.45.4, the version already pinned in `packages/db`.

**Decision.**
- **Contracts first.** `packages/contracts/src/domain/` is the documented schema: id formats (`ids.ts`), closed vocabularies including the seven assurance labels and the relation whitelist (`vocabulary.ts`), one zod schema per entity (`entities.ts`) and the event envelope (`events.ts`). A unit test in `packages/db` fails if a table and its contract drift apart.
- **Opaque ids.** `<prefix>_<26 Crockford base32 chars>`: a millisecond timestamp plus 80 random bits (ULID layout, lowercase), for example `wrk_…` for a work and `evt_…` for an event. Prefixes name the kind, so a misplaced id is caught by a CHECK on every table. Existing core tables (users, organizations) keep their UUIDs.
- **One Postgres schema per bounded context** (ARCHITECTURE §5): `trust` (subjects, identity claims, provenance assertions), `content` (works, versions, artifacts), `evidence` (sources, claims), `agents` (agent runs, tool actions, approvals). `core` holds the object registry, relation rules, relations and the outbox.
- **Common columns.** Every domain row has `tenant_id`, `schema_version`, `created_at`, `updated_at` and `created_by_subject_id`. Evidence-like rows add MASTER_SPEC §3's provenance fields: visibility, source provider, first seen, asserted by, observed by, capture method, validation mechanism, assurance label (nullable), limitations, content hash and signature, plus `revoked_at`. A row whose capture method is `inferred` may not carry an assurance label (CHECK), so model output never labels itself.
- **Object registry and typed relations.** A trigger registers every domain row in `core.objects (tenant_id, id, kind)`. `core.relations` references both endpoints there with composite foreign keys, so an edge cannot point at a missing object, at an object of another tenant, or at the wrong kind. A foreign key to `core.relation_rules` (14 seeded triples, equal to `RELATION_RULES` in contracts) refuses forbidden edges. Inferred edges must carry a review state. An object with edges cannot be deleted; deleting an organization removes everything in it, edges included.
- **Same-tenant references everywhere.** Every reference between domain rows is a composite `(tenant_id, id)` foreign key, so even the schema owner cannot link across tenants.
- **Append-oriented writes.** The application role has SELECT and INSERT, column-limited UPDATE for state changes only (status, revocation, supersession, review state, display fields) and no DELETE. Row-level security requires membership, hides `private` rows from everyone but their creator, and only lets you attribute a row to yourself or an agent you own (`core.can_act_as`).
- **Audit ledger.** `core.audit_events` (Phase 04) becomes a per-tenant hash chain: a trigger assigns `seq`, `prev_hash`, `actor_digest` and `hash` (SHA-256) under a per-tenant advisory lock; `core.verify_audit_chain(tenant)` returns the first broken event. The chain hashes a digest of the actor, not the user id, so erasing a person keeps it verifiable (docs/RETENTION.md). Existing events were backfilled.
- **Outbox.** Producers call `enqueueEvent(tx, …)` inside their own scoped transaction; the application role may only append events for its current tenant and cannot read them back. A separate `originos_worker` role (no BYPASSRLS, outbox tables only, no tenant data) claims ready events with `FOR UPDATE SKIP LOCKED` under a lease, runs each subscribed consumer through `consumeOnce` (a `(event_id, consumer)` receipt committed in the same transaction as the consumer's writes), then marks the event delivered, retries it with capped exponential backoff, or dead-letters it after `maxAttempts`. Delivery is at least once; processing is once per consumer. With no consumers registered the worker does not poll and says so at startup.
- **Down migrations.** Each migration has `migrations/down/<tag>.sql`; `rollbackMigrations` / `pnpm --filter @originos/db rollback -- <steps> --destroy-data` undoes them in order, refuses `NODE_ENV=production`, and an integration test runs every migration down and up on a throwaway database and compares schema fingerprints.

**Deviations from ADR-002.** `Artifact` is a stored-bytes or external-URL record of a work version (ADR-002 called stored bytes `Asset`; storage itself arrives in Phase 07). Relations use `created_by_subject_id`/`asserted_by_subject_id`/`observed_by_subject_id`, `capture_method`, `validation_mechanism` and `superseded_by_id` for ADR-002's `asserted_by`, `observed_by`, `method`, `validation` and `superseded_by`; `valid_from` is not modelled yet. `AgentEvent`, `Receipt`, `LicenseDeclaration`, `Collection` and `ProviderConnection` are left to the phases that use them.

**Production requirement.** The SECURITY DEFINER helpers (`core.member_role`, `core.can_act_as`, `core.register_object`, the audit trigger) read tables with FORCE ROW LEVEL SECURITY as their owner. That works only if the migration role is a superuser or has BYPASSRLS. Locally it is a superuser; the managed database in Phase 44 must give the migration role BYPASSRLS (and keep the application and worker roles without it).

**Why not the alternatives.** A graph database or one generic JSON "objects" table would lose foreign keys and typed columns. Polymorphic edges without a registry cannot have real foreign keys, so orphans would be prevented only by code. A message broker for the outbox adds infrastructure that ADR-003 deferred. Hash chaining inside the database detects tampering by anyone who can write the table; external anchoring of the chain head is Phase 20's signed receipts.

**Verification (2026-11-22).**
- `packages/contracts` unit tests: 14/14; `packages/db` unit tests 21/21, including the contracts ↔ tables drift test.
- `packages/db` integration: 39/39, including `domain.test.ts` (15: ids and registry, version and idempotency uniqueness, cross-tenant references refused even for the owner, agent runs need an agent subject, inferred rows unlabeled, relation whitelist equal to contracts, forbidden/wrong-kind/missing/self/duplicate edges refused, no orphan deletes, RLS for outsiders, attribution, private rows, immutability and no DELETE, audit chain tampering and erasure) and `rollback.test.ts` (every migration down and up, identical schema).
- `apps/worker` integration: 8/8 (`outbox.test.ts`: delivery once per consumer, worker outage with lease expiry, crash after a consumer committed, retry with backoff and no partial effects, dead-letter, three concurrent workers never double-claim, worker role sees no tenant data, application role appends only for its own tenant).

## ADR-026 — Object storage, upload ingestion and the durable job runner (Phase 07)

**Status.** Accepted 2026-11-22 (proposed in Phase 07; accepted by the owner before merge). Implements the storage half of ARCHITECTURE §4 and ADR-003's "start pragmatically" workflow engine.

**Versions (checked 2026-11-22 against npm and Docker Hub).** `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` 3.1164.0 (latest; path-style addressing, checksums only when required, so SeaweedFS and other S3-compatible stores work). `clamav/clamav:1.4` (the official image; the non-`_base` tags ship signature databases, and freshclam updates them on start). SeaweedFS stays at `chrislusf/seaweedfs:4.54` (Phase 01); in CI it takes local-only credentials from `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` because services cannot mount the repository. No queue library was added.

**Decision: storage and uploads.**
- `packages/storage` wraps one S3-compatible store with two buckets: **quarantine** (every upload lands here) and **files** (only scanned, type-confirmed copies). Keys are `tenants/<tenant>/uploads/<upload id>`, never derived from the file name.
- **Accepted types** are a closed list in `packages/contracts/src/ingest.ts`: PDF, PNG, JPEG, GIF, WebP, plain text and Markdown, up to 25 MB (`UPLOAD_MAX_BYTES` may lower it). SVG, HTML, archives and office documents are refused: they execute or hide content in browsers and parsers.
- **The API refuses before storing:** declared type and extension must agree, the size is checked from `Content-Length` and again while reading, the type is sniffed from magic bytes (text must be valid UTF-8 without control characters and must not start like HTML/SVG/XML), and names lose path segments, control and bidi-override characters. Each refusal has a stable code (`too_large` 413, `type_not_accepted`/`type_mismatch` 415, `empty`, `invalid_filename`) and a sentence the web app shows.
- **One transaction** records the upload (status `quarantined`, SHA-256), enqueues `ingest.scan_upload` (idempotency key = upload id) and writes the `file.uploaded` audit event. The only route that accepts a non-JSON body is `POST /v1/files` (`@AcceptsBinaryBody`), and the origin check still applies.
- **The worker scans:** it re-reads the quarantined bytes, re-checks the hash and the type, and streams them to clamd (`INSTREAM`). Clean → copy to the files bucket, then a `release` step sets `clean` and emits `upload.cleaned` on the outbox. Infected or mismatched → a `reject` step sets `rejected` with the signature and emits `upload.rejected`; the bytes stay in quarantine. No scanner configured → `scan_unavailable` and the job is dead-lettered (an admin retries once a scanner exists). Scanner or storage outage → retry with backoff.
- **Downloads and previews** exist only for clean files: a signed URL valid for 60 s (`Content-Disposition: attachment`, the sniffed type), audited as `file.download_link_issued`. Previews return text as text (rendered escaped) and images as a 60 s inline URL; PDFs get no preview, because rendering untrusted PDFs needs a sandboxed renderer (revisit in Phase 21).
- **Tenant isolation** is enforced three ways: row-level security on `core.uploads` (members of the tenant only), keys under the tenant prefix, and URLs signed per object. Another organization gets 404, and a signed URL cannot be altered to reach another key.

**Decision: jobs.**
- Our own runner on Postgres (`packages/db/src/jobs.ts`, `apps/worker/src/job-runner.ts`) instead of a queue library, so jobs are ordinary tenant rows under row-level security (members see the jobs they started; owners and admins see all and act on them; the worker role sees jobs and uploads only) and can carry progress, human waits and cancellation without a second store.
- **Claiming:** `FOR UPDATE SKIP LOCKED` under a lease (`locked_until`), with a heartbeat while the handler runs; a crashed worker's job is reclaimed when its lease expires. Each claim counts an attempt.
- **Steps:** `ctx.step(name, fn)` commits the step's database writes together with a `core.job_steps` row, so a retried job never repeats a finished step (this is how "retries without duplicate publishing" holds: outbox events are written inside steps). External side effects inside a step use `<job id>:<step>` as their idempotency key.
- **Failure:** retry with capped exponential backoff; `PermanentJobError` or the last attempt dead-letters the job (`dead`) for review; owners and admins retry it with a fresh set of attempts.
- **Cancel:** a pending or waiting job is cancelled at once; a running job is flagged and stops at its next progress report.
- **Human waits:** `ctx.waitForPerson(reason)` parks the job as `waiting` (the attempt is not counted); an owner or admin approves or rejects it on the jobs page, and the job resumes with that decision in `ctx.resumeInput`.
- **Temporal migration contract.** Handlers are sequences of named, idempotent steps with deterministic code between them, plus waits for people. Those map one to one onto Temporal activities and signals; nothing outside `jobs.ts` and `job-runner.ts` knows how jobs are stored. Move when a workflow needs timers longer than days, fan-out of hundreds of children, or cross-service sagas.

**Why not the alternatives.** pg-boss (12.39.0) and graphile-worker (0.18.0) are good Postgres queues, but both keep jobs in their own schema, outside our row-level security, so tenant visibility, progress, human waits and dead-letter review would need a parallel table anyway. Temporal now would add a cluster before any workflow needs it (ADR-003). Scanning inside the API would hold requests for seconds and put clamd's attack surface in the request path. Serving files through the API would load it with large bodies; short-lived signed URLs keep the bytes on the store.

**Known limits.** If the database insert fails after the object was stored, the quarantined object is orphaned (it is never served; a cleanup job is Phase 44's lifecycle rules). API readiness does not include storage (an outage makes uploads answer 503 `storage_unavailable`, not the whole API unready); the worker's readiness does include storage and the scanner. Scanning happens once, at upload: re-scanning with newer signatures is not implemented. Production buckets, lifecycle rules, encryption and access policies are infrastructure (Phase 44); `pnpm storage:setup` refuses `NODE_ENV=production`.

**Verification (2026-11-22).** See BUILD_STATE "Phase 07 handoff" for the commands: storage unit 11/11 and integration 4/4 (real SeaweedFS and ClamAV: EICAR detected, signed URL bound to its key and expiring), worker integration 21/21 (jobs and scans), API integration 38/38 (files and jobs), Playwright 137/137 including `files.spec.ts` against the real API, worker, store and scanner.

---

## Official sources to verify when each ADR is settled

Claude Code hooks/memory/skills (code.claude.com/docs), MCP spec and SDKs (modelcontextprotocol.io), CAI SDK (opensource.contentauthenticity.org/docs), Slack Bolt JS (docs.slack.dev/tools/bolt-js), GitHub Apps docs, OpenTelemetry spec, W3C VC Data Model and OID4VC, Stripe test mode, chosen queue library docs. Links are recorded with the date checked; none were checked in Phase 00.
