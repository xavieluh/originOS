# OriginOS — Claude Code Full-Platform Prompt System

This repository holds the OriginOS code and the **build specification, 48 execution prompts, project skills and continuity files** it is built from. Phases 00–09 are implemented (accounts and organizations, authorization and consent, the domain schema and ledger, files and jobs, Origin Connect, IdentityMesh profiles); the rest of the product is not built yet. Status and evidence: [`docs/BUILD_STATE.md`](docs/BUILD_STATE.md).

## Developing the code

Fresh checkout to running stack (Node 22.13+, Docker, optionally uv):

```bash
scripts/bootstrap.sh   # checks tools, creates .env, installs deps, builds, starts Postgres + object storage, migrates
scripts/dev.sh         # checks the database is migrated, then web :3000, api :4000, worker, and the mcp-server, telemetry and media-validator scaffolds (health checks only) in watch mode
scripts/check.sh       # the same checks CI runs (add --db for database integration tests)
```

### On Windows

The scripts are Bash, and the package scripts run on Windows too (environment variables are set through `cross-env`). What you need:

- **Git Bash** (comes with [Git for Windows](https://git-scm.com/download/win)): run `bash scripts/bootstrap.sh` and `bash scripts/dev.sh` from it. PowerShell and cmd work for `pnpm` commands but not for `scripts/*.sh`.
- **Docker Desktop**, installed and *running* before you run the scripts (they stop with "Docker is installed but not running" otherwise). Use the WSL 2 backend.
- **pnpm through corepack:** `corepack enable` writes into the Node.js install folder, so run it once from a terminal opened with "Run as administrator", or install pnpm with `npm install -g pnpm@10.28.0` instead.
- **"ports are not available … 127.0.0.1:5432 … forbidden by its access permissions"** means Windows has reserved that port (Hyper-V/WSL often reserve ranges; `netsh interface ipv4 show excludedportrange protocol=tcp` lists them) or another Postgres is using it. Pick a free port in `.env`, for example `POSTGRES_HOST_PORT=55432`, change `5432` to `55432` in `DATABASE_URL` and `TEST_DATABASE_URL`, then run `bash scripts/dev.sh` again. The same works for `S3_HOST_PORT`, `SMTP_HOST_PORT` and `MAILPIT_HOST_PORT`.
- **uv** is optional: without it the Python ai-worker is skipped.
- `pnpm` may print "Ignored build scripts: esbuild…". That is expected: esbuild ships its binaries as optional packages, so the skipped install script is not needed.

### Troubleshooting the local database

`pnpm db:status` says whether the database in `DATABASE_URL` is reachable and migrated, and prints the fix. `scripts/dev.sh` runs it before starting anything. `pnpm db:migrate`, `pnpm db:status` and `pnpm db:seed` read the repository's `.env` themselves, so they work from any terminal; a variable already set in your shell wins over `.env`.

- **Sign-up fails with "something went wrong", and the API log shows `role "originos_app" does not exist`.** The database has not been migrated: migrations create that role, the tables and the row-level security policies. Run `pnpm db:migrate` from the repository root, then `scripts/dev.sh` again. `scripts/bootstrap.sh` now does this for you; checkouts set up before that change need it once.
- **`Cannot reach the database`, or `password authentication failed`.** The services are not reaching the compose Postgres. Check that the port in `DATABASE_URL` (and `TEST_DATABASE_URL`) matches `POSTGRES_HOST_PORT` in `.env`; if another Postgres is installed on your machine, it may be the one answering on 5432.
- **`migration(s) this checkout does not know`.** The database was migrated by newer code (for example another branch). Pull the latest code, or reset local data with `scripts/db-reset-local.sh`.
- **Start over completely:** `docker compose down -v` deletes the local containers' data, then `scripts/bootstrap.sh` recreates and migrates it. Only local development data is lost.

Details, ports and conventions: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md). Secrets policy:
[`docs/SECRETS.md`](docs/SECRETS.md). Build progress: [`docs/BUILD_STATE.md`](docs/BUILD_STATE.md).

## Continuing the build

1. Work in this repository; `CLAUDE.md`, `.claude/skills/origin-build/SKILL.md`, `docs/` and `prompts/` are at its root. (Originally the kit was extracted into an empty repository; that step is done.)
2. Open that root folder in VS Code and start **Claude Code**. Run `/origin-build NN` for the next phase in `docs/BUILD_STATE.md`.
3. After review and passing tests, run the next phase. Prefer a new session for long phases; the repo state and `CLAUDE.md` carry continuity.
4. If something is unclear, read `PROMPT_INDEX.md` and the phase markdown. The command's exact requirements are in each phase file.
5. Run `/origin-audit` periodically for a critical, independent check. Save changes with Git between major phases.
6. When an API credential is required, obtain it from the provider yourself; never paste secrets into project files. Enable external writes and paid infrastructure only with explicit approval.

## Important files
- `CLAUDE.md` — compact permanent rules loaded by Claude Code.
- `docs/MASTER_SPEC.md` — the long-term **master prompt** and complete platform product contract.
- `PROMPT_INDEX.md` — numbered plan linking all 48 phase prompts.
- `prompts/*.md` — exact Claude Code implementation prompts.
- `TRIGGERS.md` — single-line slash commands, in order, plus fallback prompt.
- `.claude/skills/origin-build/SKILL.md` — user-invocable Claude Code skill to run a phase.
- `.claude/skills/origin-audit/SKILL.md` — independent review skill.
- `.claude/agents/*.md` — optional specialist review agents.
- `docs/BUILD_STATE.md`, `docs/ACCEPTANCE_MATRIX.md`, `docs/DECISIONS.md`, `docs/THREAT_MODEL.md` — continuity, requirements and safety.

## Start here

```text
/origin-build 00
```

If Claude Code skills do not appear, ensure the folders are directly in the repo and use `/reload-skills` if supported; otherwise use the fallback plain-text trigger in `TRIGGERS.md`.

## Product vision
OriginOS is one multi-tenant platform covering AgentTrust, PublisherOS, EvidenceGraph, OriginGraph, IdentityMesh, CreatorRights, Verified Human, Origin Studio, Library, Intelligence, Automations, Registry, Analytics, Connect, and Marketplace. Underlying systems share identities, sources, audit events, signatures, permissions and integration infrastructure. No AI model is treated as a truth detector; no tool can access non-consented/private provider data by merely being connected.

## Scope and expectations
The 48 phases provide detailed starting specifications and acceptance requirements, not a fixed engineering estimate. Claude will still need to make implementation decisions, verify current SDK docs, write real tests, use official accounts and obtain your approvals for credentials/deployment. Some phases will take multiple sessions. **Do not run the entire prompt set at once**; it is designed for staged, auditable construction.

## Technical research references (verify versions while implementing)
- Claude Code project instructions: https://code.claude.com/docs/en/memory
- Claude Code project skills: https://code.claude.com/docs/en/skills
- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- Content Authenticity Initiative SDK: https://opensource.contentauthenticity.org/docs/
- Slack Bolt JavaScript: https://docs.slack.dev/tools/bolt-js/
- MCP security and specifications: https://modelcontextprotocol.io/

© No affiliation with Anthropic, Content Authenticity Initiative, or Slack is implied.
