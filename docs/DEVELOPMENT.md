# Developing OriginOS

Phase 01 scaffold. Local tooling, Docker Compose, CI and conventions are extended in Phase 02.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22.13 or newer (`.nvmrc` says 22) | Tested on 22.23.5 |
| pnpm | 10.28.0 (pinned in `package.json` `packageManager`) | `corepack enable` picks it up |
| uv | 0.11 or newer | Only for `services/ai-worker` (Python 3.12+) |
| PostgreSQL | 16 | Optional in Phase 01. Without it, readiness reports the database as *not configured* |

## Clean install and checks

```bash
pnpm install --frozen-lockfile
pnpm build          # compiles shared packages, apps and services (turbo)
pnpm check          # lint + typecheck + unit tests in every package
pnpm format:check   # prettier
```

`pnpm lint` also enforces the architectural import boundaries (see "Boundaries" below).

## Running locally

```bash
cp .env.example .env   # optional; every variable has a safe default
pnpm dev               # all TypeScript processes in watch mode
```

| Process | Package | Default address | Health |
|---|---|---|---|
| Web | `apps/web` | http://127.0.0.1:3000 | `GET /api/health` |
| API | `apps/api` | http://127.0.0.1:4000 | `GET /health/live`, `GET /health/ready` |
| Worker | `apps/worker` | http://127.0.0.1:4050 (health only) | `GET /health/live`, `GET /health/ready` |
| MCP server | `apps/mcp-server` | http://127.0.0.1:4100 | `GET /health/live`, `GET /health/ready` |
| Telemetry ingest | `services/telemetry` | http://127.0.0.1:4200 | `GET /health/live`, `GET /health/ready` |
| Media validator | `services/media-validator` | http://127.0.0.1:4300 | `GET /health/live`, `GET /health/ready` |
| AI worker (Python) | `services/ai-worker` | no server | `uv run --project services/ai-worker python -m originos_ai_worker` prints a health report |

All services bind to loopback by default. The environment is loaded from the process environment;
`pnpm dev` does not read `.env` by itself, so export variables or use a tool such as `direnv`.
Phase 02 adds Docker Compose for Postgres.

Production-style run: `pnpm build`, then `pnpm --filter @originos/api start` (and likewise for the
other packages).

To see the API's database check go green, point it at any Postgres 16:

```bash
DATABASE_URL=postgres://user@127.0.0.1:5432/originos pnpm --filter @originos/api start
curl -s http://127.0.0.1:4000/health/ready
```

Readiness semantics (shared contract `HealthResponse` in `packages/contracts`):

- `/health/live` never checks dependencies.
- `/health/ready` returns 200 when every configured dependency answers, 503 when one is `unreachable` or `error`.
- A dependency that is optional and not configured is reported as `not_configured` and does not fail readiness.
- `DATABASE_URL` is required when `NODE_ENV=production`; startup fails otherwise.

## Real-database test

`packages/db` has tests that run only when `TEST_DATABASE_URL` is set:

```bash
TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/originos pnpm --filter @originos/db test
```

## Layout

```
apps/web               Next.js app (public network, private workspace, developer console)
apps/api               NestJS + Fastify modular monolith; bounded contexts in src/modules/<name>
apps/worker            outbox dispatch and durable jobs (queue arrives in Phase 07)
apps/mcp-server        remote MCP server (tools arrive in Phase 23)
packages/contracts     Zod contracts shared by every surface (leaf package)
packages/db            Drizzle + node-postgres; only api and worker may import it
packages/config        env validation, shared ESLint config and boundary rule
packages/service-kit   shared Fastify bootstrap: redacted logs, correlation IDs, health routes
packages/ui            shared React primitives (design system grows in Phase 03)
services/telemetry     agent telemetry ingest (Phase 16)
services/media-validator  sandboxed C2PA validation (Phase 12)
services/ai-worker     Python research worker (Phases 24-25); calls models only via the API gateway
```

## Boundaries

Enforced by the `originos/boundaries` ESLint rule (`packages/config/eslint/boundaries.mjs`,
ARCHITECTURE §4, ADR-013):

1. Only `apps/api`, `apps/worker` and `packages/db` may import `@originos/db`, `pg`, `postgres` or `drizzle-*`.
2. Code in one API module may import another module only through `src/modules/<name>/index.ts`.
3. No package imports a deployable (`apps/*`, `services/*`) by name.
4. Relative imports may not leave their own workspace package.
5. `packages/contracts/src` may import only `zod`.

Violation fixtures live in `packages/config/test/boundaries.test.ts`.

## Conventions in force

- TypeScript strict (plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), ESM everywhere.
- Exact dependency versions (`.npmrc` `save-exact=true`); `engine-strict=true`.
- NestJS constructor parameters use explicit `@Inject(Token)` (ADR-014).
- Env validation errors name variables, never values. Logs redact credential headers and fields.
- Next.js telemetry is disabled in the web scripts.
