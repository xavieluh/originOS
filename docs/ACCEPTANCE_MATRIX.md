# Acceptance and validation matrix

**IMPORTANT:** everything below is a specification, not a completed test. A result changes from NOT RUN only when a test or review has actually been executed, with evidence linked.

v1.0 (Phase 00, accepted 2026-11-22). Part A is new in Phase 00. Part B regenerates the per-phase table from `PHASES.json` in full (the previous table cut each row off mid-sentence).

## Part A — Capability traceability matrix

Each row traces a requirement in MASTER_SPEC to the module that owns it, the phase that builds it, and how it will be verified. Verification types: **U** unit, **C** API contract, **I** integration, **E** browser E2E, **N** negative/abuse test, **M** manual review with recorded evidence, **S** static/CI check. "Result" stays **NOT RUN** until a test actually executes.

| ID | Capability | Spec ref | Module | Phase(s) | Verification | Acceptance evidence required | Result |
|---|---|---|---|---|---|---|---|
| **Platform foundation** |||||||
| CAP-001 | Single monorepo builds from clean checkout | §4, §9 | Shared | 01, 02 | S, I | CI log: install, typecheck, lint, test, build green | PASS (2026-11-22): GitHub Actions run 45063816462, job "Lint, typecheck, test, build" green from a clean install |
| CAP-002 | Module import boundaries enforced | ADR-001 | Shared | 01 | S, N | Lint fails on violation fixture | PASS (2026-11-22): `packages/config/test/boundaries.test.ts` violation fixtures fail lint, allowed import passes |
| CAP-003 | Secrets excluded from git and logs | §5, §9 | Shared | 02, 42 | S, N | Secret scan in CI; log redaction test | PASS for Phase 02 scope (2026-11-22): gitleaks in CI run 45063816462 found no leaks; redaction tests pass. Phase 42 extends this |
| CAP-004 | Honest empty/loading/error/"not yet available" states | §8 | Shared UI | 03 | E, M | E2E visits every nav route; no dead controls | PASS for Phase 03 shell (local, 2026-11-22): `e2e/navigation.spec.ts` visits all 10 routes, checks "not yet available" counts, button `data-action` allowlist and every link; CI run 45069044008 green |
| CAP-005 | Accessible keyboard navigation and contrast | §8 | Shared UI | 03 | E, S | Automated a11y check + keyboard E2E | PASS for Phase 03 shell (local, 2026-11-22): axe zero violations on all routes in light and dark; keyboard E2E; contrast unit tests; CI run 45069044008 green |
| **Identity, access, privacy** |||||||
| CAP-010 | Sign-in, orgs, memberships, invitations | §5 | Core | 04 | I, E | Create org, invite, expire, revoke | PASS (local, 2026-11-22): `apps/api/test/integration/tenancy.test.ts` 16/16; `apps/web/e2e/auth.spec.ts` (sign-up with real email verification, invite/accept, revoke, transfer, reset, TOTP, passkey, sessions) |
| CAP-011 | Tenant isolation at query, service and storage layers | §5, §7.7 | Core | 04–07, 42 | N, I | Cross-tenant read/write/object fetch denied in tests | PARTIAL (2026-11-22): query layer (Postgres RLS requiring membership, `packages/db` 15/15) and service layer (API cross-org tests) pass for core tables; storage (Phase 07) and red-team suite (42) not built |
| CAP-012 | RBAC + resource grants + explicit deny, backend-enforced | §5 | Core | 05 | U, N | Forbidden actions rejected with UI bypassed | PASS (local, 2026-11-22): `packages/authz` 16/16 (deny by default, explicit deny, resource-scoped grants, escalation refusals); `apps/api/test/integration/authz.test.ts`: a member calling 9 management endpoints directly gets 403 `no_permission`, a deny beats an admin's role and cannot be self-lifted; RLS on grants (`rls-authz.test.ts`) |
| CAP-013 | Agent principals narrower than owning user by default | §5 | Core / AgentTrust | 05 | U, N | Default agent grant is a strict subset | PASS (local, 2026-11-22): unit test for every role (agent ⊂ owner, strictly smaller); API test: new agent can only read the organization and a grant beyond its owner has no effect. Agents cannot authenticate until Phases 16–18 |
| CAP-014 | Consent recorded, inspectable, revocable (directory, telemetry, public provenance) | §5 | Core | 05, 31, 41 | I, E | Revocation removes published copy / stops collection | PARTIAL (2026-11-22): consent is recorded, inspectable and revocable with history (API and E2E tests; RLS keeps personal consent private and revocation final). Nothing consumes it yet: stopping collection and removing published copies are tested when Phases 16, 31 and 41 build those features |
| CAP-015 | Audit event on every permission/role change | §5 | Core | 05 | I | Role change → audit row | PASS (local, 2026-11-22): role changes, membership changes, ownership transfer, grants and denies (created, revoked), agents (created, disabled) and consent (given, revoked) write append-only audit rows; asserted in `apps/api` integration and `e2e/access.spec.ts`. Full ledger is Phase 06 |
| CAP-016 | Export, erasure, retention, legal hold with honest receipt-retention policy | §5 | Admin | 41 | I, M | Purge test; erasure request tracked; policy doc | NOT RUN |
| **Domain model and events** |||||||
| CAP-020 | Canonical schema with evidence provenance fields | §3 | Core | 06 | U, S | Migrations up/down; schema doc in contracts | NOT RUN |
| CAP-021 | Typed Relation edges with forbidden-type and orphan prevention | §3, ADR-002 | Graph | 06, 13 | U, N | Forbidden edge insert fails | NOT RUN |
| CAP-022 | Transactional outbox, idempotent consumers | §4 | Core | 06 | I, N | Event survives worker outage; processed once logically | NOT RUN |
| CAP-023 | Durable jobs: retry, cancel, dead-letter, human wait | §4 | Core | 07, 35 | I, N | Crash/retry does not duplicate side effects | NOT RUN |
| CAP-024 | Assurance labels as closed enum (7 values), no aggregate score | §3 | Trust | 06, 14, 31 | U, S, M | Contract enum; UI copy review | NOT RUN |
| **Content and provenance** |||||||
| CAP-030 | Safe ingestion: scan, sniff, size limits, quarantine | §4, threat model | Core | 07 | N | Malicious/oversize fixture quarantined | NOT RUN |
| CAP-031 | Works, versions, contributors; separate byte and normalized-text hashes | §3 | OriginGraph | 11 | U, I | Hash changes on byte change; graph persists | NOT RUN |
| CAP-032 | Canonical URL duplicates cannot overwrite another creator | §7.1 | OriginGraph | 11 | N | Conflict test | NOT RUN |
| CAP-033 | C2PA validation: valid / tampered / unsigned / unsupported | §3, §7.7 | Trust | 12 | U, N | Four fixtures behave per ADR-005 | NOT RUN |
| CAP-034 | Provenance graph traversal with depth/size bounds and tenant visibility | §3 | OriginGraph | 13 | I, N | Cycle + boundary tests | NOT RUN |
| CAP-035 | Public verification record and cross-origin embed showing only public data | §1, §5 | OriginGraph / Verified Human | 14 | E, N | Anonymous view; separate-origin embed test; stale status on change | NOT RUN |
| **Identity mesh and registry** |||||||
| CAP-040 | Domain control via DNS/HTML challenge; account control via OAuth | §3 | IdentityMesh | 09 | I, N | Self-report alone never labelled verified | NOT RUN |
| CAP-041 | Pseudonymous profiles without legal identity exposure | §5 | IdentityMesh | 09 | E | Profile without legal name | NOT RUN |
| CAP-042 | Portable credentials on a validated spec profile with revocation | §4 | IdentityMesh | 10 | U, N | Tampered fails; revoked marked revoked | NOT RUN |
| CAP-043 | Signer interface, KMS keys, rotation, historical verifiability | §4, ADR-006 | Trust | 10, 20, 36, 42 | U, N, S | Tamper test; rotation test; no keys in repo | NOT RUN |
| CAP-044 | Registry lookup with issuer revocation and privacy filtering | §2 | Origin Registry | 36 | I, N | Revoked issuer flips result; private agent not public | NOT RUN |
| **AI** |||||||
| CAP-050 | Provider-agnostic gateway, swappable in tests | §4 | Platform | 15 | U, I | Swap provider in test | NOT RUN |
| CAP-051 | Model outage → recoverable queued state; deterministic paths keep working | §4, CLAUDE.md 8 | Platform | 15, 43 | N | Outage simulation | NOT RUN |
| CAP-052 | Tokens/cost metered where exposed; budgets enforced | §9 | Platform | 15, 39 | I | Metering rows reconcile with fixture calls | NOT RUN |
| CAP-053 | AI never used as proof; outputs source-linked | §3, CLAUDE.md 6 | All | 15, 25, 34 | U, M | Eval fixtures; no unsourced assertion stored as fact | NOT RUN |
| CAP-054 | Prompt-injection resistance for retrieved content | §9 | Platform / Intelligence | 15, 34, 42 | N | Injection fixture does not trigger action | NOT RUN |
| **AgentTrust** |||||||
| CAP-060 | Authenticated telemetry ingest with redaction, dedupe, backpressure | §6 | AgentTrust | 16 | I, N | Replay no duplicate; redaction in logs/UI | NOT RUN |
| CAP-061 | Claude Code hook collector, opt-in, documented events only | §6 | AgentTrust | 17 | I, M | Real hook smoke test; disable works | NOT RUN |
| CAP-062 | SDK instrumentation for Claude API/Agent SDK + generic OTEL | §6 | AgentTrust | 18 | C, I | Sample agent run with linked tool events | NOT RUN |
| CAP-063 | Coverage gaps shown as unknown | §6 | AgentTrust | 16–19 | E, M | Uninstrumented run shows "unknown" | NOT RUN |
| CAP-064 | Flight recorder of persisted events; failed/denied vs confirmed distinct | §3, §8 | AgentTrust | 19 | E | Timeline from DB fixtures, not hardcoded | NOT RUN |
| CAP-065 | Policy hold before execution on routed actions; approval expiry/replay rejected | §9 | AgentTrust | 20 | I, N | Held action; expired/replayed approval rejected | NOT RUN |
| CAP-066 | Signed execution receipts | §4 | AgentTrust | 20 | U, N | Receipt signature validation + tamper | NOT RUN |
| CAP-067 | Outcome confirmed from provider, not agent narration | §3, §6 | AgentTrust / Connect | 21 | I, N | PR merge state from GitHub webhook | NOT RUN |
| **Integrations** |||||||
| CAP-070 | OAuth broker with PKCE/state, encrypted tokens, revocation | §6 | Origin Connect | 08 | N, I | State replay test; token never in client/log | NOT RUN |
| CAP-071 | Webhook signature verification, replay window, idempotency | §7.7 | Origin Connect | 08, 21, 22 | N | Duplicate/replayed webhook safe | NOT RUN |
| CAP-072 | Truthful status NOT CONFIGURED / CONNECTED / DEGRADED / REVOKED | §8 | Origin Connect | 08 | E, N | Revoked connection stops calls and shows REVOKED | NOT RUN |
| CAP-073 | GitHub App least privilege, read-only default | §6 | Origin Connect | 21 | I, M | Scopes shown; revoke stops sync | NOT RUN |
| CAP-074 | Slack app: signed requests, server-side approval revalidation | §6, §7.4 | Origin Connect | 22 | I, N | Slack approval rechecks permission; retry no double publish | NOT RUN |
| CAP-075 | Remote MCP server: authn, tenant audience, no approval bypass | §6, §7.6 | Origin Connect | 23 | C, N | Unauth rejected; cross-tenant blocked; approvals not grantable | NOT RUN |
| CAP-076 | Research connectors with identifier dedupe, licence-aware full text | §6 | EvidenceGraph | 24 | I, N | Same DOI twice → one source; no hallucinated full text | NOT RUN |
| CAP-077 | WordPress + generic webhook publishing with idempotency | §6, §7.5 | PublisherOS | 30 | I, N | Sandbox post with verified ID; no duplicate on failure | NOT RUN |
| **Research and writing** |||||||
| CAP-080 | Claims anchored to spans; assessments with cited passages or "insufficient" | §3 | EvidenceGraph | 25 | U, I | Every assessment links evidence or says insufficient | NOT RUN |
| CAP-081 | Disagreement state for conflicting sources | §7.2 | EvidenceGraph | 25 | I | Conflict fixture → disagreement | NOT RUN |
| CAP-082 | Human override appends, never erases | §3 | EvidenceGraph | 25 | U | Original assessment retained | NOT RUN |
| CAP-083 | Evidence explorer with accessible non-graph alternative | §4, §8 | EvidenceGraph | 26 | E | Claim → exact span; table view | NOT RUN |
| CAP-084 | Library organize/search/share within tenant | §2 | Origin Library | 27 | I, N | Private source absent from other tenant search | NOT RUN |
| CAP-085 | Editor with stable citations, version history, AI-use disclosure | §2 | Origin Studio | 28 | E, U | Reload + conflict test; disclosure state | NOT RUN |
| **Publishing, community, rights** |||||||
| CAP-090 | Editorial workflow with no self-approval where restricted | §7.4 | PublisherOS | 29 | I, N | Self-approval rejected | NOT RUN |
| CAP-091 | Publication correlated to approved version in OriginGraph | §7.5 | PublisherOS / OriginGraph | 30 | I | External URL edge to approved version | NOT RUN |
| CAP-092 | Opt-in creator directory with consented fields only, removal/appeal | §1 | Verified Human | 31 | E, N | Unconsented field absent | NOT RUN |
| CAP-093 | Newsletters with opt-in/unsubscribe and throttling | §1 | Verified Human | 32 | I, N | Non-subscriber never receives digest | NOT RUN |
| CAP-094 | Licence declarations, reuse requests, disputes with audit | §2 | CreatorRights | 33 | I, N | Ownership never shown as proven | NOT RUN |
| **Platform modules** |||||||
| CAP-100 | Federated permitted search + evidence-linked investigator | §2 | Origin Intelligence | 34 | I, N | Unauthorized items excluded at retrieval | NOT RUN |
| CAP-101 | Durable automations with approval nodes | §2 | Origin Automations | 35 | I, N | Resume after crash; duplicate trigger safe | NOT RUN |
| CAP-102 | Measured dashboards; estimated vs observed labelled | §8 | Origin Analytics | 37 | I | Totals reconcile with test events | NOT RUN |
| CAP-103 | Versioned OpenAPI, scoped API keys, SDKs, docs with real endpoints | §1 | Developer platform | 38 | C, N | Contract tests; key cannot escalate scope | NOT RUN |
| CAP-104 | Stripe billing in test mode; server-side plan limits | §10 | Platform | 39 | I, N | Webhook retry no double credit | NOT RUN |
| CAP-105 | Marketplace with manifest scopes, admin consent, uninstall revokes | §2 | Origin Marketplace | 40 | I, N | Unapproved extension not installable | NOT RUN |
| **Quality and release** |||||||
| CAP-110 | STRIDE review, OWASP, dependency/container scans, cross-tenant red team | §9 | Shared | 42 | S, N, M | Zero open critical/high | NOT RUN |
| CAP-111 | Load tests, SLOs, graceful degradation, cost envelope | §9 | Shared | 43 | I, M | Measured p50/p95 under documented load | NOT RUN |
| CAP-112 | IaC, staging, backups with tested restore, rollback | §4, §9 | Shared | 44 | M, I | Restore test evidence | NOT RUN |
| CAP-113 | Flagship end-to-end workflow (MASTER_SPEC §7.1–7.6) | §7 | All | 45 | E, I | Automated suite with labelled sandbox providers | NOT RUN |
| CAP-114 | Failure-safety suite (MASTER_SPEC §7.7) | §7.7 | All | 08, 12, 20, 42, 45 | N | Revoked connection, tampered media, cross-tenant, approval expiry, provider outage, duplicate webhook | NOT RUN |
| CAP-115 | Component licensing, contributor docs, vulnerability reporting | §10 | Shared | 46 | M | License per component; SECURITY.md | NOT RUN |
| CAP-116 | Release audit and pilot with actual vs proposed labelled | §9 | Shared | 47 | M | Release checklist links evidence | NOT RUN |

### End-to-end workflows (MASTER_SPEC §7) → capabilities

| Workflow | Capabilities | First phase where testable |
|---|---|---|
| 7.1 Creator verifies domain and submits article | CAP-040, 031, 035, 024 | 14 |
| 7.2 References parsed; claims linked; contradictions flagged | CAP-076, 080, 081 | 25 |
| 7.3 Claude research agent observed | CAP-061/062, 063, 064, 052 | 19 |
| 7.4 Editor approves; Slack and web update same state | CAP-090, 074, 065 | 29 |
| 7.5 Publish to test WordPress; correlated in OriginGraph | CAP-077, 091 | 30 |
| 7.6 Claude via MCP explains provenance from saved records | CAP-075, 100 | 34 |
| 7.7 Failure safety | CAP-114 | 45 |


## Part B — Per-phase acceptance checks (from PHASES.json)

| Phase | Title | Required checks | Result | Evidence |
|---|---|---|---|---|
| 00 | Product contract and architecture | ☐ docs/ARCHITECTURE.md and docs/DECISIONS.md describe concrete service boundaries<br>☐ docs/PRODUCT_MAP.md accounts for all 15 modules<br>☐ docs/ACCEPTANCE_MATRIX.md maps each capability to verification<br>☐ no implementation claims without implementation | PASSED by document review; owner accepted 2026-11-22 | docs/ARCHITECTURE.md, DECISIONS.md, PRODUCT_MAP.md, THREAT_MODEL.md |
| 01 | Production-shaped monorepo | ☑ clean install works with documented commands<br>☑ typecheck lint unit tests run<br>☑ web and api start locally and health endpoints respond<br>☑ code compiles without fake integrations | PASS (local run 2026-11-22; not yet in CI, which is Phase 02) | Clean checkout: `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm check`, `pnpm format:check`; forced run `turbo run build lint typecheck test --force` 46/46 tasks, 0 cached. 69 TS tests + 4 pytest pass, 2 real-DB tests pass with `TEST_DATABASE_URL` (Postgres 16). Built and dev-mode processes answered `/health/*` (api, worker, mcp-server, telemetry, media-validator) and `/api/health` (web); api/worker readiness 200 with DB up, 503 with DB stopped; web page shows Ready / Not ready / Unreachable accordingly. No integration endpoints exist; scaffolds serve health only and 404 elsewhere (tests assert this). See docs/BUILD_STATE.md Phase 01 handoff. |
| 02 | Local development, CI and conventions | ☑ fresh checkout bootstraps from README<br>☑ CI validates a real build<br>☑ secrets are excluded from git and logs<br>☑ a developer can start web api database and worker locally | PASS (2026-11-22, local and CI) | Fresh `git clone` → `scripts/bootstrap.sh` → `scripts/smoke.sh` and `scripts/dev.sh` locally. GitHub Actions run 45063816462: 5/5 jobs green (gitleaks full history "no leaks found", lint/typecheck/test/build, Python, compose + DB integration + smoke, audit + SBOM). Log redaction tests in service-kit, api, config, ai-worker. See BUILD_STATE Phase 02 handoff. |
| 03 | Distinctive UX system and app shell | ☑ responsive polished shell renders at mobile/tablet/desktop<br>☑ all navigation routes resolve and unfinished modules clearly say not yet available<br>☑ accessible keyboard focus and contrast checks pass<br>☑ no dead buttons shown as working | PASS (2026-11-22, local and CI run 45069044008) | `scripts/e2e-docker.sh` in mcr.microsoft.com/playwright:v1.65.1-noble: 78/78 (routes, dead-control allowlist, axe light/dark, keyboard, 22 visual baselines at 390/820/1440 px + dark). `packages/ui` 73 unit tests incl. 54 WCAG contrast checks. `scripts/check.sh` and `scripts/smoke.sh` pass. See BUILD_STATE Phase 03 handoff. |
| 04 | Authentication, teams and organizations | ☑ cross-org account access is impossible in tests<br>☑ invitation expiry and revocation work<br>☑ user can create an organization and switch authorized workspaces<br>☑ logged-out requests cannot access private endpoints | PASS (local, 2026-11-22; CI runs on the PR) | Cross-org: `packages/db` RLS tests against Postgres (forged tenant id reveals nothing; non-members cannot join, invite, rename, write audit or take ownership) and `apps/api` integration (switch into another org → 404, forged active org → 409 on every tenant route, cross-org revoke → 404); E2E: removed member loses the workspace immediately. Expiry/revocation: API integration (expired, revoked, superseded, single-use, wrong email) and E2E (revoked link shows "withdrawn", other email refused, used link refused). Create/switch: E2E journey creates orgs, accepts an emailed invitation (Mailpit) and switches between workspaces. Logged out: API integration (every non-public route 401, forged cookie rejected), E2E (private pages redirect to sign-in, API 401s), smoke test. Commands and counts in BUILD_STATE Phase 04 handoff. |
| 05 | Authorization, policy baseline and consent | ☑ role change triggers audit record<br>☑ backend rejects forbidden reads and writes even if UI bypassed<br>☑ agent permissions are narrower than owning user by default<br>☑ consent can be inspected and revoked | PASS (local, 2026-11-22) | `packages/authz` 16/16; `packages/db` RLS 23/23; `apps/api` integration 29/29 (`authz.test.ts`: "a role change is recorded…", "a member calling management endpoints directly gets 403…", "an agent starts narrower than its owner…", "a person gives, inspects and revokes…"); Playwright 128/128 incl. `access.spec.ts` |
| 06 | Core domain schema, ledger and outbox | ☐ all migrations apply and rollback safely in test env<br>☐ an outbox event survives simulated worker outage and is processed once logically under retries<br>☐ foreign keys and uniqueness hold<br>☐ schemas documented in contracts | NOT RUN | — |
| 07 | Object storage, ingestion queues and workflow core | ☐ unauthorized tenant cannot retrieve an object<br>☐ failed job retries safely without duplicate publishing<br>☐ upload errors are visible<br>☐ malicious/oversize file is quarantined or rejected | NOT RUN | — |
| 08 | Origin Connect OAuth and integration broker | ☐ OAuth state/replay tests pass<br>☐ provider token never reaches client or log<br>☐ disconnected providers stop new API calls<br>☐ webhook signatures and retries verified | NOT RUN | — |
| 09 | IdentityMesh creator and organization profiles | ☐ verified domain requires successful challenge, not self-report<br>☐ reviewer actions recorded<br>☐ revoked or stale proofs are clearly labeled<br>☐ pseudonymous profiles work without exposing legal identity | NOT RUN | — |
| 10 | IdentityMesh portable credentials | ☐ tampered credential fails validation<br>☐ revoked credential is marked revoked<br>☐ test verifier checks issuer and validity rules<br>☐ unsupported credential formats show explicit unsupported state | NOT RUN | — |
| 11 | Content, authorship and versions | ☐ upload -> version -> contributor graph is persistent<br>☐ hash changes when bytes change<br>☐ duplicate canonical URL cannot silently overwrite another creator<br>☐ unauthorized re-hosted text is not published | NOT RUN | — |
| 12 | C2PA media validation service | ☐ valid fixture passes and modified media fails or reports breakage per SDK<br>☐ unsigned is unverified not fraudulent<br>☐ validation returns machine readable diagnostics<br>☐ never display "human-authored guaranteed" | NOT RUN | — |
| 13 | OriginGraph provenance graph and explorer | ☐ graph roundtrip works on multiple interconnected works<br>☐ cycle handling and tenant visibility boundaries tested<br>☐ evidence panel explains each edge provenance<br>☐ performance safe bounds in place | NOT RUN | — |
| 14 | Public verification pages and embeddable widgets | ☐ public anonymous users see only explicitly public data<br>☐ changed content yields clear invalid/stale status<br>☐ embed works in a separate-origin test page<br>☐ claims never overstate human authorship | NOT RUN | — |
| 15 | Provider-agnostic AI gateway and safety budgets | ☐ model calls use shared gateway and can swap provider in tests<br>☐ API unavailable yields recoverable queued state<br>☐ cost and tokens logged where exposed<br>☐ sources never invented by gateway | NOT RUN | — |
| 16 | AgentTrust telemetry collector | ☐ replayed events do not duplicate logical actions<br>☐ tenant isolation holds on ingestion<br>☐ trace shows source and observability gaps<br>☐ sensitive values redacted in logs and UI | NOT RUN | — |
| 17 | Claude Code hooks and CLI collector | ☐ real hook smoke test produces at least one observed event<br>☐ user can disable collection<br>☐ collector cannot exfiltrate secrets by default<br>☐ dashboard identifies the originating installation | NOT RUN | — |
| 18 | Claude API and external agent SDK instrumentation | ☐ instrumented sample run appears with linked tool events<br>☐ absence of instrumentation is displayed as unknown<br>☐ custom test agent emits valid events<br>☐ model credentials remain server-side | NOT RUN | — |
| 19 | AgentTrust flight recorder and investigations | ☐ timeline displays real persistent events not hardcoded activity<br>☐ denied or failed actions visibly differ from confirmed effects<br>☐ authorized users can export scoped records<br>☐ search and filtering tested | NOT RUN | — |
| 20 | AgentTrust policy, approvals and signed receipts | ☐ disallowed action held before execution in controlled path<br>☐ approval expiration and replay attacks rejected<br>☐ no claim of universal enforcement over disconnected agents<br>☐ receipt signature and integrity validation tested | NOT RUN | — |
| 21 | GitHub App and outcome reconciliation | ☐ webhook signature tested and duplicates safe<br>☐ PR merge state is sourced from GitHub not agent narration<br>☐ revoked installation stops sync<br>☐ audit events link to repo metadata without leaking private source | NOT RUN | — |
| 22 | OriginOS for Slack | ☐ Slack command accesses only authorized workspace<br>☐ approving from Slack revalidates server-side permission and state<br>☐ retry does not cause double publish<br>☐ integration can be disabled | NOT RUN | — |
| 23 | Claude MCP connector and developer agent tools | ☐ unauthenticated MCP requests rejected<br>☐ cross-tenant tool call blocked<br>☐ tools return source-linked structured results<br>☐ human approvals cannot be bypassed via MCP | NOT RUN | — |
| 24 | Research source connectors and ingestion | ☐ same DOI imported twice resolves one canonical source<br>☐ unavailable full text is not hallucinated<br>☐ retrieved passages link to version and page where present<br>☐ ingestion retry and metadata updates work | NOT RUN | — |
| 25 | Claim extraction and citation assessments | ☐ every assessment links inspectable evidence or explicitly insufficient data<br>☐ no fabricated citations<br>☐ conflicting source test produces a disagreement state<br>☐ human correction does not erase original assessment | NOT RUN | — |
| 26 | EvidenceGraph explorer | ☐ clicking a claim opens exact source span<br>☐ graph filters and exports work on real DB data<br>☐ source permission boundaries hold<br>☐ exported citations include identifiers | NOT RUN | — |
| 27 | Origin Library and knowledge workspaces | ☐ user can organize retrieve and share permitted source records<br>☐ private source never appears via another tenant search<br>☐ edits generate versioning/audit event<br>☐ upload and indexing failures visible | NOT RUN | — |
| 28 | Origin Studio editor and collaboration | ☐ draft survives reload and concurrent update conflict<br>☐ citations maintain stable source references<br>☐ AI-assisted segments have clear disclosure state<br>☐ editor exports valid content | NOT RUN | — |
| 29 | PublisherOS editorial workflow | ☐ author cannot self-approve in policy-restricted organization<br>☐ reviewer can request changes<br>☐ scheduled item publishes only after required approvals<br>☐ cancellations are recorded | NOT RUN | — |
| 30 | PublisherOS external distribution connectors | ☐ WordPress sandbox integration demonstrates actual post and verified ID<br>☐ provider failures do not create duplicate posts<br>☐ OriginGraph relates final external page to approved version<br>☐ disconnected connector cannot publish | NOT RUN | — |
| 31 | Verified Human public creator network | ☐ public profile displays only consented fields<br>☐ unsigned work cannot appear cryptographically verified<br>☐ directory search and source links work<br>☐ removal request and appeal flow recorded | NOT RUN | — |
| 32 | Community distribution, newsletters and discovery | ☐ double opt-in/unsubscribe enforced as applicable<br>☐ digest sends only to opted-in subscribers and respects throttling<br>☐ referral tracking avoids leaking private data<br>☐ metrics distinguish content visits from active engagement | NOT RUN | — |
| 33 | CreatorRights licensing and disputes | ☐ licensed work displays correct user-declared terms and history<br>☐ dispute state is visible and auditable<br>☐ unverified ownership is not shown as proven<br>☐ rights reviewers cannot silently rewrite existing receipts | NOT RUN | — |
| 34 | Origin Intelligence search and investigator | ☐ questions about agent history return evidence-linked runs<br>☐ search excludes unauthorized items at retrieval time<br>☐ unsupported claim results clearly indicate no evidence<br>☐ tool prompt injection fixture does not trigger unauthorized action | NOT RUN | — |
| 35 | Origin Automations workflow builder | ☐ workflow resumes after simulated worker crash<br>☐ duplicate trigger cannot double-execute non-idempotent action<br>☐ invalid graphs rejected<br>☐ approval node actually pauses and resumes<br>☐ disabled workflow stops firing | NOT RUN | — |
| 36 | Origin Registry of actors and attestations | ☐ revoked issuer clearly changes verification result<br>☐ workspace-private agent not indexed publicly<br>☐ rotation preserves historical receipt verifiability where possible<br>☐ public API results enforce disclosure controls | NOT RUN | — |
| 37 | Origin Analytics and operational dashboards | ☐ dashboard totals reconcile with test events<br>☐ time filters and export work<br>☐ another workspace data is invisible<br>☐ demo analytics use labeled fixture data | NOT RUN | — |
| 38 | Developer REST API, SDKs and docs portal | ☐ OpenAPI contract tests run against server<br>☐ API key cannot escalate scopes<br>☐ sample SDK can verify content and retrieve run in local stack<br>☐ docs examples use actual endpoints | NOT RUN | — |
| 39 | Billing, metering and commercial accounts | ☐ Stripe test-mode checkout and webhook work<br>☐ retry cannot double-credit usage<br>☐ plan limits enforced server-side<br>☐ disabled billing displays setup requirement instead of fake working checkout | NOT RUN | — |
| 40 | Origin Marketplace and extension contracts | ☐ extension install records scopes and admin consent<br>☐ unapproved extension not installable<br>☐ uninstall revokes configured access<br>☐ initial listings are real internally implemented integrations | NOT RUN | — |
| 41 | Administration, privacy and trust operations | ☐ support staff cannot view private data without scoped authorization<br>☐ export and erasure request tracked<br>☐ retention purge tested<br>☐ moderation decisions require reason and produce audit event | NOT RUN | — |
| 42 | Security hardening and independent verification preparation | ☐ all critical and high severity issues remediated or block release<br>☐ no cross-tenant read in automated tests<br>☐ signing keys never embedded in code<br>☐ threat model updated with real mitigations | NOT RUN | — |
| 43 | Performance, reliability and failure recovery | ☐ publish p50/p95 latency under documented test load not invented claims<br>☐ duplicate/retry invariants hold<br>☐ graceful degradation tested<br>☐ measurable resource cost recorded | NOT RUN | — |
| 44 | Deployment, domains and disaster recovery | ☐ staging deploy is demonstrated with output evidence if credentials exist, otherwise blocked accurately with manual steps<br>☐ restore from backup tested locally/staging<br>☐ no production destructive operations without explicit user approval<br>☐ rollback documented | NOT RUN | — |
| 45 | Integrated OriginOS flagship workflow | ☐ automated integration suite passes locally with mock/sandbox provider only where clearly labeled<br>☐ all artifacts linked by identifiers<br>☐ failed approvals block publication<br>☐ MCP reads same persisted trace, not invented output | NOT RUN | — |
| 46 | Open-source governance, developer community and docs | ☐ license scope is explicit per component<br>☐ clean external contributor can run local dev from docs<br>☐ no false endorsements or standards-compliance claims<br>☐ vulnerability reporting path exists | NOT RUN | — |
| 47 | Release audit and first real customer pilot | ☐ release checklist links test evidence<br>☐ no critical/high blockers ignored<br>☐ first deployment and pilot results clearly labeled actual vs proposed<br>☐ docs/BUILD_STATE.md lists exact completed, partial, blocked and next tasks | NOT RUN | — |
