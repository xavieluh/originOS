# Developing OriginOS

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22.13 or newer (`.nvmrc` says 22) | Tested on 22.23.5 |
| pnpm | 10.28.0 (pinned in `package.json` `packageManager`) | `scripts/bootstrap.sh` enables it through corepack if missing |
| Docker with Compose v2 | any current | Runs Postgres and the object-storage emulator. `--no-docker` skips it |
| uv | 0.11 or newer | Only for `services/ai-worker` (Python 3.12+); skipped with a warning if absent |
| gitleaks | 8.30.1 | Optional locally; CI always runs it |

Scripts are bash (macOS, Linux, WSL).

## Fresh checkout

```bash
scripts/bootstrap.sh     # once: .env from .env.example, pnpm install, uv sync, build, docker compose up, pnpm db:migrate
scripts/dev.sh           # every day: containers, pnpm db:status, then all TypeScript processes in watch mode, .env exported
```

Run `pnpm db:migrate` after pulling new migrations (`scripts/dev.sh` stops and says so when one is pending; `pnpm db:status` checks on its own). Then open **http://localhost:3000** (use `localhost`, not `127.0.0.1`: cookies and passkeys are bound to `ORIGINOS_PUBLIC_URL`), and create an account. The verification email lands in Mailpit at http://127.0.0.1:8025; nothing is sent to real addresses. `scripts/db-reset-local.sh` drops and re-migrates the local databases (local compose only).

| Process | Package | Address | Health |
|---|---|---|---|
| Web | `apps/web` | http://127.0.0.1:3000 | `GET /api/health` |
| API | `apps/api` | http://127.0.0.1:4000 | `GET /health/live`, `GET /health/ready` |
| Worker | `apps/worker` | http://127.0.0.1:4050 (health only) | `GET /health/live`, `GET /health/ready` |
| MCP server | `apps/mcp-server` | http://127.0.0.1:4100 | `GET /health/live`, `GET /health/ready` |
| Telemetry ingest | `services/telemetry` | http://127.0.0.1:4200 | `GET /health/live`, `GET /health/ready` |
| Media validator | `services/media-validator` | http://127.0.0.1:4300 | `GET /health/live`, `GET /health/ready` |
| AI worker (Python) | `services/ai-worker` | no server | `uv run --project services/ai-worker python -m originos_ai_worker` |
| Postgres 18 + pgvector 0.8.7 | compose `postgres` | 127.0.0.1:5432 (`originos`, `originos_test`) | `pg_isready` |
| S3-compatible storage (SeaweedFS 4.54) | compose `object-storage` | http://127.0.0.1:8333 | `/healthz`; buckets `originos-quarantine` and `originos-files` (`pnpm storage:setup`, run by bootstrap and dev) |
| Malware scanner (ClamAV 1.4) | compose `scanner` (profile `scanner`) | 127.0.0.1:3310 | `clamdcheck.sh`; needs ~1.5 GB of memory and a minute to start. `scripts/dev.sh --no-scanner` skips it, and uploads then stay "not scanned" |
| Mail catcher (Mailpit 1.34.0) | compose `mail` | SMTP 127.0.0.1:1025, UI http://127.0.0.1:8025 | `/mailpit readyz` |

Everything binds to loopback. Redis is not part of the stack because nothing uses it (ADR-003).

Useful compose commands: `docker compose ps`, `docker compose logs -f postgres`, `docker compose down` (keeps data), `docker compose down -v` (deletes local data).

## Checks

```bash
scripts/check.sh         # .env ignored, gitleaks (if installed), prettier, lint, typecheck, unit tests, build
scripts/check.sh --db    # plus database integration tests against TEST_DATABASE_URL
scripts/smoke.sh         # after a build: start web, api, worker against the DB and verify them end to end
```

Individual commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`, `pnpm test:integration`.

CI (`.github/workflows/ci.yml`) runs on every push to `main` and every pull request:

| Job | What it proves |
|---|---|
| Secret scan | gitleaks over the full history; no tracked `.env` |
| Lint, typecheck, test, build | the whole TypeScript workspace from a clean install |
| ai-worker (Python) | ruff and pytest |
| Local stack | `compose.yaml` starts; migrations apply; DB (row-level security) and API (auth, tenancy, CSRF) integration tests; seed guard; `scripts/smoke.sh` |
| Web E2E | Playwright against built web + API with Postgres and Mailpit service containers: auth journeys, routes, axe, keyboard, visual |
| Dependency audit and SBOM | `pnpm audit --prod --audit-level high`; CycloneDX SBOM uploaded as an artifact |

Migrations live in `packages/db/migrations` (drizzle-kit 0.31.11 generates them from `src/schema.ts` with `pnpm --filter @originos/db db:generate`; row-level security is hand-written SQL). Never edit an applied migration; add a new one.

## Browser tests (Phase 03, real stack since Phase 04)

`apps/web/e2e` holds Playwright suites for sign-up, verification, invitations, workspaces, password reset, two-step verification and passkeys (a virtual authenticator), routes and dead controls, axe accessibility (light and dark), keyboard use and visual regression. Playwright starts the built API (after migrating `originos_test` and creating the `originos-e2e-*` buckets) on port 4990, the built worker (health on 4991) and the built web app on http://localhost:3100. The E2E stack lowers the upload limit to 1 MB. Start the containers first (`docker compose --profile scanner up -d --wait`), then run after `pnpm build`:

```bash
scripts/e2e-docker.sh                       # everything, in the pinned Playwright image (needs Docker)
scripts/e2e-docker.sh --update-snapshots    # regenerate visual baselines after an intended UI change
```

Always regenerate baselines with the script, not on your host: CI compares against the same image (`mcr.microsoft.com/playwright:v1.65.1-noble`), and host fonts render differently. The design system gallery is at `/design-system` in development (production needs `ORIGINOS_ENABLE_GALLERY=true`). Any new `<button>` needs a `data-action` listed in `apps/web/e2e/routes.ts`, or the suite fails.

## Files and background jobs (Phase 07)

Uploads go browser → web `/api/files` (same origin) → API `POST /v1/files`, which checks the type, name and size, sniffs the bytes, stores them in the quarantine bucket and queues an `ingest.scan_upload` job. The worker scans with ClamAV and copies clean files to the files bucket. `/settings/files` lists uploads and their status; `/settings/jobs` (owners and admins) shows jobs and lets you retry failed ones, cancel, or answer jobs waiting for a person. Design: ADR-026.

To try the malware path locally, upload a `.txt` file containing the standard EICAR test string; it is harmless, and ClamAV flags it.

Job handlers live in `apps/worker/src/jobs/` and are registered in `src/handlers.ts`. Put each side effect in `ctx.step(name, fn)`, so a retry never repeats it; call `ctx.progress()` in long loops (it also notices cancellation).

## Readiness semantics

Shared contract `HealthResponse` (`packages/contracts`):

- `/health/live` never checks dependencies.
- `/health/ready` returns 200 when every configured dependency answers and 503 when one is `unreachable` or `error`.
- An optional dependency without configuration is `not_configured` and does not fail readiness.
- `DATABASE_URL` is required when `NODE_ENV=production`.

## Logging and correlation IDs

- Every process writes JSON lines with `level`, `time`, `msg` and, for requests, `correlationId`.
- The `x-correlation-id` header is accepted when it is 8 to 128 characters of `[A-Za-z0-9_-]`, otherwise replaced with a UUID, and echoed on every response. The web app's `src/proxy.ts` assigns one to each page request and forwards it to the API, so one ID follows a request across web and API logs.
- Credential headers and credential-named fields are redacted (`packages/service-kit/src/logging.ts`, `services/ai-worker/src/originos_ai_worker/logging_setup.py`). See [SECRETS.md](SECRETS.md).

## Sample data

`pnpm db:seed` runs registered seed sets (`packages/db/src/seed.ts`). It refuses when `NODE_ENV=production`, and refuses a non-loopback database unless `SEED_ALLOW_NON_LOCAL=true`. Seeded text must carry the `[SAMPLE]` label. No seed sets exist until Phase 06 adds tables.

## Layout

```
apps/web               Next.js app (public network, private workspace, developer console)
apps/api               NestJS + Fastify modular monolith; bounded contexts in src/modules/<name>
apps/worker            outbox dispatch and durable jobs (queue arrives in Phase 07)
apps/mcp-server        remote MCP server (tools arrive in Phase 23)
packages/contracts     Zod contracts shared by every surface (leaf package)
packages/db            Drizzle + node-postgres, seed guard; only api and worker may import it
packages/config        env validation, shared ESLint config and boundary rule
packages/service-kit   shared Fastify bootstrap: redacted logs, correlation IDs, health routes
packages/ui            shared React primitives (design system grows in Phase 03)
services/telemetry     agent telemetry ingest (Phase 16)
services/media-validator  sandboxed C2PA validation (Phase 12)
services/ai-worker     Python research worker (Phases 24-25); calls models only via the API gateway
infra/local            compose init files (Postgres extensions, S3 emulator credentials)
scripts                bootstrap, dev, check, smoke
```

## Boundaries

Enforced by the `originos/boundaries` ESLint rule (`packages/config/eslint/boundaries.mjs`, ADR-013):

1. Only `apps/api`, `apps/worker` and `packages/db` may import `@originos/db`, `pg`, `postgres` or `drizzle-*`.
2. Code in one API module may import another module only through `src/modules/<name>/index.ts`.
3. No package imports a deployable (`apps/*`, `services/*`) by name.
4. Relative imports may not leave their own workspace package.
5. `packages/contracts/src` may import only `zod`.

## Conventions

- TypeScript strict (plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), ESM everywhere, Prettier formatting.
- Exact dependency versions (`.npmrc` `save-exact=true`); `engine-strict=true`; GitHub Actions pinned to commit SHAs.
- NestJS constructor parameters use explicit `@Inject(Token)` (ADR-014).
- Env validation errors name variables, never values.
- Branches: work on a feature branch and open a pull request; `main` changes only through reviewed PRs with green CI.
- Next.js and Turborepo telemetry are disabled in scripts and CI.
