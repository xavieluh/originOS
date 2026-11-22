# OriginOS build state

**Current phase:** 06 — PASSED, IN REVIEW (PR open; not merged)
**Last fully completed phase:** 05 (authorization, policy baseline and consent; PR #6 merged by owner 2026-11-22).
**Environment:** Repository xavieluh/originOS. Local stack via Docker Compose (Postgres 18 + pgvector, S3 emulator); GitHub Actions CI added in Phase 02. Nothing deployed.
**Implementation status:** Monorepo scaffold, local dev tooling, CI, and (Phase 03) the design system and app shell: public, workspace and developer layouts with eight workspace routes that show honest "not yet available" states. Phase 04 adds real accounts (Better Auth: email + password with verification, password reset, TOTP two-step verification, passkeys), organizations, memberships, invitations, ownership transfer and an append-only audit log, all in the `core` Postgres schema behind row-level security. Phase 05 adds the single permission evaluator (`packages/authz`: roles, resource-scoped grants, explicit deny, agent and service actors), agents capped by their owner, and consent records with history, with API guards, settings pages and audit events. Phase 06 adds the canonical domain schema (contracts plus 12 tables in four context schemas, an object registry with whitelisted typed relations, append-oriented writes), a hash-chained audit log, the transactional outbox with a worker dispatcher, down migrations and the retention policy (docs/RETENTION.md). No product module and no external integration exists yet; production email delivery is not configured.

## Phase progress

| Phase | Status | Evidence / tests | Blockers |
|---|---|---|---|
| 00 Product contract and architecture | COMPLETE (docs only) | ARCHITECTURE.md, DECISIONS.md (ADR-001–012, all Accepted), PRODUCT_MAP.md, ACCEPTANCE_MATRIX.md (Part A traceability), THREAT_MODEL.md baseline. Checks reviewed manually; see "Phase 00 check status" below. | — |
| 01 Production-shaped monorepo | COMPLETE | All 4 checks passed locally 2026-11-22 (see Phase 01 handoff and ACCEPTANCE_MATRIX row 01). PR #2 merged 2026-11-22. | — |
| 02 Local development, CI and conventions | COMPLETE | All 4 checks passed locally and in GitHub Actions run 45063816462 (see Phase 02 handoff). PR #3 merged 2026-11-22. | — |
| 03 Distinctive UX system and app shell | COMPLETE | All 4 checks passed locally 2026-11-22: 78/78 Playwright tests in the pinned container (routes, dead controls, axe light and dark, keyboard, 22 visual baselines), 73 UI unit tests incl. 54 contrast checks, `scripts/check.sh` and `scripts/smoke.sh` green. GitHub Actions run 45069044008: 6/6 jobs green, incl. `web-e2e` against the committed baselines. See Phase 03 handoff. PR #4 merged 2026-11-22. | — |
| 04 Authentication, teams and organizations | COMPLETE | All 4 checks passed locally 2026-11-22: DB RLS integration 15/15, API integration 16/16, Playwright 119/119 in the pinned container against the real API, Postgres and Mailpit (auth journeys, routes, axe, keyboard, 24 visual baselines), `scripts/check.sh --db` and `scripts/smoke.sh` green. See Phase 04 handoff. PR #5 merged 2026-11-22. | Production SMTP provider not chosen (BLOCKED, see handoff) |
| 05 Authorization, policy baseline and consent | COMPLETE | All 4 checks passed locally 2026-11-22: authz unit 16/16, DB RLS integration 23/23, API integration 29/29, Playwright 128/128 in the pinned container, `scripts/check.sh --db` and `scripts/smoke.sh` green. See Phase 05 handoff. PR #6 merged 2026-11-22. | ADR-024 Accepted. GitHub Actions run 45078282778: 6/6 jobs green |
| 06 Core domain schema, ledger and outbox | PASSED, IN REVIEW | All 4 checks passed locally 2026-11-22: contracts 14/14, db unit 21/21, DB integration 39/39 (domain schema, RLS, audit chain, every migration down and up), worker outbox integration 8/8, API integration 29/29, Playwright 128/128 in the pinned container, `scripts/check.sh --db` and `scripts/smoke.sh` green. See Phase 06 handoff. | ADR-025 Proposed. GitHub Actions run 45080783848: 6/6 jobs green |
| 07 Object storage, ingestion queues and workflow core | NOT STARTED | — | — |
| 08 Origin Connect OAuth and integration broker | NOT STARTED | — | — |
| 09 IdentityMesh creator and organization profiles | NOT STARTED | — | — |
| 10 IdentityMesh portable credentials | NOT STARTED | — | — |
| 11 Content, authorship and versions | NOT STARTED | — | — |
| 12 C2PA media validation service | NOT STARTED | — | — |
| 13 OriginGraph provenance graph and explorer | NOT STARTED | — | — |
| 14 Public verification pages and embeddable widgets | NOT STARTED | — | — |
| 15 Provider-agnostic AI gateway and safety budgets | NOT STARTED | — | — |
| 16 AgentTrust telemetry collector | NOT STARTED | — | — |
| 17 Claude Code hooks and CLI collector | NOT STARTED | — | — |
| 18 Claude API and external agent SDK instrumentation | NOT STARTED | — | — |
| 19 AgentTrust flight recorder and investigations | NOT STARTED | — | — |
| 20 AgentTrust policy, approvals and signed receipts | NOT STARTED | — | — |
| 21 GitHub App and outcome reconciliation | NOT STARTED | — | — |
| 22 OriginOS for Slack | NOT STARTED | — | — |
| 23 Claude MCP connector and developer agent tools | NOT STARTED | — | — |
| 24 Research source connectors and ingestion | NOT STARTED | — | — |
| 25 Claim extraction and citation assessments | NOT STARTED | — | — |
| 26 EvidenceGraph explorer | NOT STARTED | — | — |
| 27 Origin Library and knowledge workspaces | NOT STARTED | — | — |
| 28 Origin Studio editor and collaboration | NOT STARTED | — | — |
| 29 PublisherOS editorial workflow | NOT STARTED | — | — |
| 30 PublisherOS external distribution connectors | NOT STARTED | — | — |
| 31 Verified Human public creator network | NOT STARTED | — | — |
| 32 Community distribution, newsletters and discovery | NOT STARTED | — | — |
| 33 CreatorRights licensing and disputes | NOT STARTED | — | — |
| 34 Origin Intelligence search and investigator | NOT STARTED | — | — |
| 35 Origin Automations workflow builder | NOT STARTED | — | — |
| 36 Origin Registry of actors and attestations | NOT STARTED | — | — |
| 37 Origin Analytics and operational dashboards | NOT STARTED | — | — |
| 38 Developer REST API, SDKs and docs portal | NOT STARTED | — | — |
| 39 Billing, metering and commercial accounts | NOT STARTED | — | — |
| 40 Origin Marketplace and extension contracts | NOT STARTED | — | — |
| 41 Administration, privacy and trust operations | NOT STARTED | — | — |
| 42 Security hardening and independent verification preparation | NOT STARTED | — | — |
| 43 Performance, reliability and failure recovery | NOT STARTED | — | — |
| 44 Deployment, domains and disaster recovery | NOT STARTED | — | — |
| 45 Integrated OriginOS flagship workflow | NOT STARTED | — | — |
| 46 Open-source governance, developer community and docs | NOT STARTED | — | — |
| 47 Release audit and first real customer pilot | NOT STARTED | — | — |

## Phase 00 check status (manual document review, 2026-11-22)

| Check | Status | Note |
|---|---|---|
| ARCHITECTURE.md and DECISIONS.md describe concrete service boundaries | Done | ARCHITECTURE §4–5, ADR-001 |
| PRODUCT_MAP.md accounts for all 15 modules | Done | 15 rows + notes |
| ACCEPTANCE_MATRIX.md maps each capability to verification | Done | Part A: 73 capabilities with verification type and evidence |
| No implementation claims without implementation | Holds | Every module NOT BUILT; every result NOT RUN |

## Current blockers

1. `/origin-build` and `/origin-audit` are still untested as slash commands (they set `disable-model-invocation: true`, so only a person can start them; phases 01–02 followed the procedure by hand). Phase 02 changed origin-build's last step to "commit on a feature branch, push and open a PR; never merge", matching how phases are delivered.
2. gitleaks has not run locally in the cloud sandbox (downloading the binary was not permitted there); it runs and passes in CI.

## Phase 06 handoff (2026-11-22)

- **Phase:** 06 Core domain schema, ledger and outbox. Procedure: origin-build, followed by hand. Branch restarted from main after PR #6 merged.
- **Files added/changed:**
  - `packages/contracts/src/domain/` (new): `ids.ts` (opaque prefixed ids, `newId`, `kindOf`, `idOf`), `vocabulary.ts` (assurance labels, capture methods, visibilities, statuses, `RELATION_RULES`), `entities.ts` (zod schema per entity, `DOMAIN_ENTITIES`), `events.ts` (event envelope); `test/domain.test.ts`.
  - `packages/db`: `src/domain-schema.ts` (12 domain tables in `trust`, `content`, `evidence`, `agents`; `core.objects`, `core.relation_rules`, `core.relations`, `core.outbox_events`, `core.outbox_receipts`), `src/tables.ts`, `src/outbox.ts` (`enqueueEvent`, `claimEvents`, `consumeOnce`, `markDelivered`, `markFailed`, `backoffMs`), `src/rollback.ts` + `rollback-cli.ts` (`rollback` script), `WORKER_ROLE`, audit chain columns on `audit_events`, `migrations/0004_domain_schema.sql` (generated), `0005_domain_rls_outbox_ledger.sql` (registry triggers and foreign keys, relation rules, grants, RLS, worker role, outbox policies, audit hash chain), `migrations/down/0000–0005`, README; tests `test/domain-schema.test.ts`, `test/integration/domain.test.ts`, `test/integration/rollback.test.ts`.
  - `apps/worker`: `src/outbox-dispatcher.ts` (claim, consume once per consumer, deliver / retry / dead-letter, poll loop), wired into `worker.ts` and `main.ts` (connects as `originos_worker`; `OUTBOX_POLL_MS`), `registeredConsumers` (empty), unit tests, `vitest.integration.config.ts`, `test/integration/outbox.test.ts`.
  - Root `test:integration` includes the worker; CI step renamed; `.env.example`; `docs/RETENTION.md` (new); DECISIONS (ADR-025, Proposed); ACCEPTANCE_MATRIX.
- **Migrations:** `0004_domain_schema`, `0005_domain_rls_outbox_ledger` (`pnpm db:migrate`). Additive: existing tables only gain the audit chain columns, and existing audit events are backfilled into the chain. Every migration now has a down script.
- **API changes:** none. Phase 06 is schema, library and worker only; modules start writing domain rows from Phase 09/11.
- **Commands executed and results (2026-11-22):**
  - `scripts/check.sh --db` → "All checks passed" (format, lint, typecheck, unit tests incl. contracts 14, db 21, worker 7; build; DB integration 39/39, API integration 29/29, worker integration 8/8).
  - Worker outbox integration re-run 3× → 8/8 each time (lease timing is real time, 200–400 ms).
  - `scripts/smoke.sh` → passed (worker readiness OK while connected as `originos_worker`).
  - `CI=1 scripts/e2e-docker.sh` → 128/128 (no UI changes in this phase; run as a regression check).
- **Acceptance checks:** migrations apply and roll back ✓; outbox event survives a worker outage and is processed once under retries ✓; foreign keys and uniqueness hold ✓; schemas documented in contracts ✓ (evidence in ACCEPTANCE_MATRIX row 06).
- **Found and fixed while testing:** the first audit chain hashed `actor_user_id`, which becomes null when a person is deleted, so erasing anyone would have broken verification for their whole history. The chain now hashes `actor_digest` (set by the trigger), and a test erases a person and verifies the chain.
- **Security and privacy:** domain tables deny by default under RLS (membership required; private rows visible only to their creator; attribution only to yourself or an agent you own); the application role has no DELETE and can only update state columns; composite same-tenant foreign keys stop cross-tenant links even for the owner; the worker role reads outbox tables only, no tenant data; outbox payloads and audit metadata carry ids only; failure reasons stored truncated. The audit chain detects tampering, it does not prevent it, and it is not externally anchored yet (Phase 20).
- **External setup required:** none. **Production note for Phase 44:** the migration role must be a superuser or have BYPASSRLS, because the SECURITY DEFINER helpers read FORCE-RLS tables as their owner (ADR-025).
- **Known gaps:**
  - No module writes domain rows or events yet, and no outbox consumer is registered, so the running worker leaves events pending (it says so at startup). Consumers arrive with search (34), notifications and Automations (35).
  - Consumers run as the worker role, which can only touch outbox tables; a consumer that writes tenant data needs a narrowly granted path, decided with its phase.
  - Export, erasure requests, purge jobs and legal hold are Phase 41 (`docs/RETENTION.md` §4).
  - Audit chain verification runs on demand only.
  - Relation traversal and the graph explorer are Phase 13.
- **Next phase:** 07 Object storage, ingestion queues and workflow core, after the Phase 06 PR is reviewed.

## Phase 05 handoff (2026-11-22)

- **Phase:** 05 Authorization, policy baseline and consent. Procedure: origin-build, followed by hand. Started on the Phase 04 branch while PR #5 was open; moved onto main after it merged.
- **Files added/changed:**
  - `packages/authz` (new): `src/model.ts` (actor types, actions, roles, resource types, grant and decision types), `src/evaluate.ts` (`evaluate`, `effectivePermissions`, `rolePermits`), `src/grants.ts` (`checkGrant`), `test/evaluate.test.ts`. Added to the import boundary table as a leaf package.
  - `packages/db`: `src/schema.ts` (`agents`, `permission_grants`, `consents`), `migrations/0002_core_authz_consent.sql` (generated), `0003_core_authz_rls.sql` (grants, column-level UPDATE for revocation only, `core.grant_subject_in_tenant`, `core.owns_agent`, policies), `test/integration/rls-authz.test.ts`.
  - `apps/api`: `src/modules/core/authz/` (`AuthzService`, `AccessService`, `ConsentService`, controllers, validation), `audit/audit.ts` (shared `recordAudit`), `@RequirePermission` and `@CurrentActor` decorators, guard loads the actor and decides permissions, tenancy routes moved from role lists to permissions, `test/integration/authz.test.ts`.
  - `apps/web`: `/settings/access` (your permissions, agents, grants and denies), `/settings/consent` (personal consent and organization policies with history), settings controls follow `GET /v1/me/permissions`, `components/action-helpers.tsx` (shared from organization settings), `lib/access-types.ts`, `app/actions/access.ts`, new audit labels, `e2e/access.spec.ts`, routes and button allowlist; the "Consent and retention" placeholder became "Data retention and deletion" (Phase 41).
  - `scripts/smoke.sh` (new endpoints answer 401 signed out), DECISIONS (ADR-024, Accepted by the owner 2026-11-22).
- **Migrations:** `0002_core_authz_consent`, `0003_core_authz_rls` (`pnpm db:migrate`). Additive only.
- **API changes:** `GET /v1/me/permissions`; `GET|POST /v1/me/consents`, `POST /v1/me/consents/:id/revoke`; `GET|POST /v1/organization/agents`, `POST /v1/organization/agents/:id/disable`, `GET /v1/organization/agents/:id/permissions`; `GET|POST /v1/organization/grants`, `POST /v1/organization/grants/:id/revoke`; `GET|POST /v1/organization/consents`, `POST /v1/organization/consents/:id/revoke`. Existing management routes now answer 403 with `{ error: "forbidden", reason }`.
- **Commands executed and results (2026-11-22):**
  - `pnpm --filter @originos/authz test` → 16/16.
  - `scripts/check.sh --db` → "All checks passed" (format, lint, typecheck, unit tests, build, DB integration 23/23, API integration 29/29).
  - `scripts/smoke.sh` → passed (adds 401 checks for the new endpoints).
  - `CI=1 scripts/e2e-docker.sh` → 128/128 (the new spec failed once first on an ambiguous label, "Effect" also matched "Your effective permissions"; fixed with exact labels).
- **CI:** the first run failed in "Local stack": with two DB integration files, their parallel first-time migrations on CI's empty database raced on creating drizzle's journal table (reproduced locally 6/6 on fresh databases). Fixed with a vitest `globalSetup` that migrates once (`vitest.integration.config.ts` in `packages/db` and `apps/api`); verified 4× on fresh databases, then run 45078282778: 6/6 green.
- **Acceptance checks:** role change triggers audit record ✓; backend rejects forbidden reads and writes with the UI bypassed ✓; agent permissions narrower than the owner by default ✓; consent can be inspected and revoked ✓ (evidence in ACCEPTANCE_MATRIX row 05).
- **Security and privacy:** one evaluator, deny by default, explicit deny wins; membership and grants re-read on every request; escalation refused (no granting what you lack, no ownership grants, no denying the owner, no self-grants or self-revocation); grants and consents are revoked, never edited (database privileges); personal consent is visible only to the person; database policies still require membership and owner/admin for management, under the API checks.
- **External setup required:** none new. The Phase 04 production SMTP item is still BLOCKED on the owner.
- **Known gaps:**
  - Agents cannot authenticate yet, so agent permissions are computed and shown but no agent traffic exists to enforce them on (AgentTrust and MCP, Phases 16–18).
  - Allow grants to people cover the audit log only until database policies consult grants (ADR-024).
  - Consent records are not yet checked by any feature, because the directory, telemetry and connectors don't exist yet; each of those phases must check for an active record.
  - Service actors exist in the evaluator only (API credentials are a later phase).
  - Retention and account deletion are Phase 41.
- **Next phase:** 06 Core domain schema, ledger and outbox, after the Phase 05 PR is reviewed.

## Phase 04 handoff (2026-11-22)

- **Phase:** 04 Authentication, teams and organizations. Procedure: origin-build, followed by hand.
- **Files added/changed:**
  - `packages/db`: `src/schema.ts` (`core` schema: users, sessions, accounts, verifications, two_factors, passkeys, organizations, memberships, invitations, audit_events), `src/client.ts` (connections run as `originos_app` via the `role` startup parameter; fails closed), `src/scope.ts` (`withScope`, `setTenant`), `src/migrate.ts` + `migrate-cli.ts`, `drizzle.config.ts`, `migrations/0000_core_auth_tenancy.sql` (generated) and `0001_core_rls.sql` (role, grants, SECURITY DEFINER helpers, policies), `test/integration/rls.test.ts`.
  - `apps/api`: `src/modules/core/` (Better Auth config and Fastify mount, global auth guard with origin/JSON CSRF checks, `@Public`/`@RequireTenant`, tenancy service and controllers, mailer + templates), env (`ORIGINOS_PUBLIC_URL`, `BETTER_AUTH_SECRET`, `SMTP_URL`, `MAIL_FROM`, `AUTH_RATE_LIMIT`), `test/integration/`.
  - `apps/web`: `/api/auth/*` same-origin proxy; `src/proxy.ts` (signed-out redirect fast path); `src/lib/{api,session,session-cookie,auth-client,auth-config,navigate}.ts`; server actions `src/app/actions/{tenancy,account}.ts`; pages `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/two-factor`, `/onboarding`, `/invitations/accept`, `/settings` (organization, members, invitations, activity), `/settings/account` (profile, password, two-step, passkeys, sessions); workspace switcher and account menu; `ClientForm`; E2E `auth.setup.ts`, `auth.spec.ts`, `support/`, updated suites and baselines.
  - `compose.yaml` (Mailpit 1.34.0), `.env.example`, `turbo.json`, `scripts/smoke.sh`, `scripts/db-reset-local.sh`, `.github/workflows/ci.yml` (migrations + API integration in local-stack; Postgres and Mailpit services for `web-e2e`), `packages/service-kit` (`redactUrl` for request logs), DECISIONS (ADR-019–023 Accepted; ADR-010 and ADR-021 notes), SECRETS, DEVELOPMENT.
- **Migrations:** `0000_core_auth_tenancy`, `0001_core_rls` (`pnpm db:migrate`).
- **API changes:** `GET /v1/auth-config` (public); Better Auth endpoints under `/api/auth/*`; `GET /v1/me`, `PUT /v1/me/active-organization`, `POST /v1/organizations`, `GET|PATCH /v1/organization`, `GET|POST /v1/organization/invitations`, `POST /v1/organization/invitations/:id/revoke`, `PATCH|DELETE /v1/organization/members/:userId`, `POST /v1/organization/transfer-ownership`, `GET /v1/organization/audit-events`, `POST /v1/invitations/lookup`, `POST /v1/invitations/accept`. Everything else answers 401 without a session.
- **Commands executed and results (2026-11-22, Node 22.23.5, pnpm 10.28.0, Docker, Postgres 18.7):**
  - `scripts/check.sh --db` → "All checks passed" (format, lint, typecheck, unit tests incl. web 28, api 11, service-kit 7, ui 73; build; DB integration 15/15; API integration 16/16).
  - `pnpm db:migrate && scripts/smoke.sh` → passed (signed-out `/v1/me` 401, `/home` redirects to sign-in, sign-in page sees a working account service).
  - `CI=1 scripts/e2e-docker.sh` → 118/119 first run; the failure was a test race (typing into the sign-in page while navigating to "forgot password"), fixed by waiting for the heading; `auth.spec` re-run twice each → 25/25; final full run after the last change → 119/119. Visual suite re-run against fresh baselines → stable.
- **Acceptance checks:** cross-org access impossible ✓; invitation expiry and revocation ✓; create org and switch workspaces ✓; logged-out requests refused ✓ (evidence in ACCEPTANCE_MATRIX row 04).
- **Bugs found and fixed while testing:** forms could fall back to a native GET before hydration and put passwords in the URL (now hydration-gated POST forms); new sessions didn't reopen the last workspace; a second invitation link opened in the same tab was ignored; a failed `SET ROLE` would have left a connection running as the schema owner (now a startup parameter that fails closed); Better Auth disables its CSRF checks under test runners (pinned on).
- **Security and privacy:** deny by default on every API route; CSRF by Origin + JSON content type plus Better Auth's checks; httpOnly session cookies, tokens never sent to browser JavaScript; invitation tokens hashed at rest, carried in URL fragments and POST bodies, query strings redacted from logs; RLS requires membership; audit log append-only; email bodies and links never logged; `AUTH_RATE_LIMIT=off` refused in production; production requires `BETTER_AUTH_SECRET` and an https public URL.
- **External setup required (BLOCKED until the owner decides):** a production email provider and its `SMTP_URL` secret (sign-up, reset and invitations show "email delivery is not set up" without it); a production `BETTER_AUTH_SECRET`; a reverse proxy that overwrites `X-Forwarded-For` (Phase 44). None is needed locally.
- **Known gaps:** no OIDC/social or enterprise SSO yet; no account deletion (Phase 05/41); TOTP setup shows the key and an `otpauth://` link but no QR code; the session cookie is renewed by one browser-side session read per workspace page load (server-rendered pages cannot set cookies); the 1-day renewal itself is Better Auth behaviour and has no automated test here; the members list has no pagination (fine at current sizes); `pnpm audit` shows one moderate dev-server advisory in esbuild via better-auth's optional drizzle-kit dependency.
- **Next phase:** 05 Authorization, policy baseline and consent.

## Phase 03 handoff (2026-11-22)

- **Phase:** 03 Distinctive UX system and app shell. Procedure: origin-build, followed by hand.
- **Files added/changed:**
  - `packages/ui`: tokens (`src/tokens.ts`, built to `dist/tokens.css`), `Button`, `Badge`/`StatusBadge`/`EventBadge`, `Card`, `DataTable`, `Drawer`, form fields (`TextField`, `TextArea`, `SelectField`, `Checkbox`), `Timeline`, `PageHeader`, `EmptyState`/`LoadingState`/`ErrorState`/`NotYetAvailable`, `SkipLink`, `ThemeToggle`, `CommandBar`, `WorkspaceShell`, `PublicShell`; pure helpers `theme.ts`, `commands.ts`, `nav.ts`. Removed Phase 01 `AppShell`.
  - `apps/web`: Tailwind 4 + fonts (`globals.css`, `postcss.config.mjs`, root layout with pre-paint theme script); route groups `(public)` at `/`, `(workspace)` with `/home`, `/agents`, `/research`, `/publish`, `/trust`, `/discover`, `/integrations`, `/settings`, `/developers` console, gated `/design-system` gallery, `not-found.tsx`; `src/lib/navigation.ts` (single nav config with the phase for each planned feature, following ARCHITECTURE §7); live `SystemStatus` card on Home and Settings; `ORIGINOS_ENABLE_GALLERY` env flag; Playwright config and `e2e/` suites with visual baselines.
  - `scripts/e2e-docker.sh`, `scripts/smoke.sh` (checks `/home` now that `/` is the public page), `.github/workflows/ci.yml` (`web-e2e` job in the Playwright image), `turbo.json`, `.env.example`, `.gitignore`, DECISIONS (ADR-019–021, Proposed; ADR-013–018 Accepted).
- **Migrations and APIs:** none.
- **Commands executed and results (2026-11-22, Node 22.23.5, pnpm 10.28.0, Docker 29.10.0):**
  - `scripts/check.sh` → "All checks passed" (format, lint, typecheck, unit tests, build; gitleaks skipped locally as before).
  - `pnpm --filter @originos/ui test` → 73 passed (54 WCAG contrast checks across both themes, 19 component and helper tests).
  - `pnpm --filter @originos/web test` → 15 passed (incl. gallery gating).
  - `scripts/e2e-docker.sh` (mcr.microsoft.com/playwright:v1.65.1-noble) → 78 passed: 20 route and dead-control tests, 23 axe tests (10 nav routes and the gallery, each in light and dark, plus open dialogs) with zero violations, 9 keyboard tests, 22 visual screenshots, plus gallery behaviour, 404 and status tests. Visual suite re-run against fresh baselines: 22/22 stable.
  - `docker compose up -d --wait && scripts/smoke.sh` → passed (Home shows the API as ready against the real database).
- **CI:** GitHub Actions run 45069044008 on 543dff5: all 6 jobs green (gitleaks, lint/typecheck/test/build, Python, local stack + smoke, audit + SBOM, and the new `web-e2e` job in the Playwright image, so the visual baselines match CI).
- **Acceptance checks:** responsive shell at 390/820/1440 px (visual baselines, no horizontal scroll test) ✓; all nav routes resolve and unbuilt features say "Not yet available · Phase NN" ✓; keyboard focus and contrast (axe in both themes, contrast unit tests, keyboard E2E) ✓; no dead buttons (allowlist test on every route, `Button` type requires behaviour) ✓.
- **Security and privacy:** no new data, endpoints or secrets. The gallery is off in production unless `ORIGINOS_ENABLE_GALLERY=true`. The theme script is a fixed string with no user input. Fonts are self-hosted, so no third-party requests. Workspace pages are public until sign-in exists (Phase 04) and say so; they hold no data.
- **External setup:** none.
- **Known gaps:** the command bar only navigates (search is Phase 34); its shortcut hint shows ⌘K on all platforms (Ctrl+K also works); the mobile nav panel has no backdrop; workspace routes have no auth guard until Phase 04.
- **Next phase:** 04 Authentication, teams and organizations.

## Phase 02 handoff (2026-11-22)

- **Phase:** 02 Local development, CI and conventions. Procedure: origin-build, followed by hand.
- **Files added/changed:** `compose.yaml`, `infra/local/` (Postgres init SQL, S3 emulator identity), `.env.example` (documented), `.gitleaks.toml`, `docs/SECRETS.md`, `.github/workflows/ci.yml`, `scripts/{lib,bootstrap,dev,check,smoke}.sh`, `turbo.json` (dev env passthrough), `packages/db` (seed guard + CLI, integration tests split into `test/integration`), `packages/service-kit` (log destination), `apps/api` (log destination option, logging test), `apps/web` (`src/proxy.ts` correlation IDs, forwarded to the API; JSON logger), `services/ai-worker` (JSON logging with redaction), `docs/DEVELOPMENT.md`, README, DECISIONS (ADR-017, ADR-018), origin-build skill (commit/PR step). Phase 01 row set to COMPLETE (PR #2 merged).
- **Migrations and APIs:** none. No tables; `pnpm db:seed` has no seed sets yet.
- **Commands executed and results (2026-11-22, Node 22.23.5, pnpm 10.28.0, Docker 29.10.0):**
  - `docker compose up -d --wait` → postgres and object-storage healthy; PostgreSQL 18.7, `vector` 0.8.7 and `pgcrypto` 1.4 in `originos` and `originos_test`; anonymous S3 request → 403.
  - `scripts/check.sh --db` → .env ignored; prettier ok; lint/typecheck/test 40/40 turbo tasks (79 TypeScript tests + 6 pytest); build 11/11; DB integration tests 3/3 (select 1, pgvector distance, unreachable port). gitleaks skipped locally (not installed).
  - `pnpm db:seed` → "No seed sets are registered yet"; with `NODE_ENV=production` → refused; with a remote host → refused. `pnpm test:integration` without `TEST_DATABASE_URL` → fails with an explicit message.
  - Fresh checkout: `git clone` → `scripts/bootstrap.sh` (after `docker compose down -v`) → `scripts/smoke.sh` passed: api and worker readiness 200 with `database: ok`, web page shows the API ready, the smoke request's correlation ID appears in the API log.
  - `scripts/dev.sh` from the fresh clone: api and worker report `database: ok`, web shows the API ready. (First attempt reported `not_configured`: Turborepo's strict env mode dropped `DATABASE_URL`. Fixed with `dev.passThroughEnv`.)
  - CI, first run (45063733696): secret scan, Python, audit/SBOM green; "Lint, typecheck, test, build" failed because turbo ran the Python package's lint in a job without uv (`uv: not found`). Reproduced locally with uv removed from PATH; fixed by filtering `@originos/ai-worker` out of the Node job (the Python job covers it).
  - CI, second run (45063816462, head 3ce2998): 5/5 jobs green. gitleaks 8.30.1 over full history: "no leaks found"; `.env` untracked check passed; `pnpm audit --prod --audit-level high` passed and the CycloneDX SBOM was uploaded; local-stack job: compose healthy, DB integration tests, seed guard, and `scripts/smoke.sh` ("Smoke test passed: web, api, worker and database are up", correlation ID found in the API log).
- **Security/privacy:** compose ports bind to 127.0.0.1; local credentials are labeled `originos-local…` and are the only gitleaks allow-list entries; `.env` ignored and checked by `scripts/check.sh` and CI; logs carry correlation IDs and redact credentials (API test asserts both on real request logs); CI has read-only `contents` permission and SHA-pinned actions; seeding refuses production and remote databases.
- **External setup:** none required. CI runs on GitHub-hosted runners in the owner's account (free minutes for public repos; private repos use the account's included minutes).
- **Remaining gaps:** migration checks start in Phase 06; Python dependency audit not needed yet (no runtime deps); scripts are bash only; gitleaks verified in CI only.
- **Recommended next:** owner reviews the PR and ADR-013–018; then Phase 03 (UX system and app shell).

## Phase 01 handoff (2026-11-22)

- **Phase:** 01 Production-shaped monorepo. Followed the origin-build skill procedure manually.
- **Files changed:** root workspace files (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.mjs`, `.npmrc`, `.nvmrc`, prettier config, `.env.example`, `.gitignore`); `apps/{web,api,worker,mcp-server}`; `packages/{contracts,db,config,service-kit,ui}`; `services/{telemetry,media-validator,ai-worker}`; `docs/DEVELOPMENT.md`; `docs/DECISIONS.md` (ADR-013–016); README pointer.
- **Prompt vs plan differences:** added `apps/worker` and `services/media-validator` (accepted ADR-001) and `packages/service-kit` (ADR-016, proposed). Tailwind deferred to Phase 03 (design system); plain CSS used. OpenAPI generation deferred to Phase 38; contracts are Zod schemas now.
- **Migrations and APIs:** no tables, no migrations (Phase 06). New HTTP endpoints, health only: API and every Node service `GET /health/live` and `GET /health/ready`; web `GET /api/health`; shared `HealthResponse` contract in `packages/contracts`.
- **Commands executed and results (Node 22.23.5, pnpm 10.28.0, from a clean checkout with node_modules, dist and caches deleted):**
  - `pnpm install --frozen-lockfile` → ok
  - `pnpm build` → 11/11 tasks ok
  - `pnpm check` (lint + typecheck + test) → 40/40 tasks ok
  - `pnpm turbo run build lint typecheck test --force` → 46/46 ok, 0 cached
  - `pnpm format:check` → ok
  - Tests: 69 TypeScript tests pass (2 real-database tests skipped without `TEST_DATABASE_URL`); `services/ai-worker` 4 pytest tests and ruff lint/format pass.
  - `TEST_DATABASE_URL=postgres://…@127.0.0.1:55432/originos pnpm --filter @originos/db test` against a throwaway local PostgreSQL 16 → 5/5 pass.
  - Started the built api, worker, mcp-server, telemetry, media-validator and web with `pnpm --filter <pkg> start`; `curl` of every health endpoint → 200 with contract-valid JSON and the caller's `x-correlation-id` echoed. API and worker readiness → 200 with `database: ok`; after stopping Postgres → 503 with `database: unreachable`. Web home page read "Ready", then "Not ready", then (API stopped with SIGTERM, exited cleanly) "Unreachable". Playwright check: first Tab stop is the skip link.
  - `pnpm dev` (watch mode): all six HTTP processes answered their health endpoints and the web page showed the API as ready.
  - Lint of a temporary `apps/web` file importing `@originos/db` → `originos/boundaries` error (file deleted afterwards).
- **Security/privacy:** all services bind to 127.0.0.1 by default; no CORS on the API (deny by default); env validation errors name variables but never print values (tested); structured logs redact authorization/cookie/API-key headers and credential-named fields (tested); readiness responses never include connection strings or driver error text (tested); correlation IDs from callers are length- and charset-limited to prevent log injection (tested); web sends `nosniff`, `X-Frame-Options: DENY` and a referrer policy and disables `X-Powered-By`; Next.js telemetry disabled; database access restricted to api/worker by lint. Not yet present: authentication (Phase 04), authorization (05), RLS (06), rate limiting and full security headers/CSP (42).
- **External accounts/scopes needed:** none.
- **Remaining gaps / known limits:** no CI; no Docker Compose; `pnpm dev` does not load `.env` automatically; web scripts set `NEXT_TELEMETRY_DISABLED=1` with POSIX syntax (Windows shells need WSL or Phase 02 tooling); `services/media-validator` runtime (Rust or Node) is decided in Phase 12, so its TypeScript scaffold may be replaced; ai-worker has no HTTP server and its `aiGateway` check is `not_configured` until Phase 15.
- **Acceptance matrix updates:** row 01 → PASS with evidence; CAP-001 → PARTIAL (CI pending Phase 02); CAP-002 → PASS.
- **Recommended next:** owner reviews the PR and ADR-013–016; optionally `/origin-audit 01`; then Phase 02 (local development, CI and conventions).

## Session handoff template

- Date/session:
- Phase being implemented:
- Files changed:
- Migrations and APIs:
- Exact commands executed and results:
- Security/privacy changes:
- External API accounts/scopes needed:
- Remaining failing tests/blocked steps:
- Acceptance matrix updates:
- Recommended next phase:
