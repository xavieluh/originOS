#!/usr/bin/env bash
# One-time setup of a fresh checkout. Safe to re-run.
#   scripts/bootstrap.sh            install deps, create .env, start Postgres + object storage, migrate
#   scripts/bootstrap.sh --no-docker   skip containers (readiness then reports the DB as not configured)
#   scripts/bootstrap.sh --no-scanner  start the containers without the malware scanner (saves ~1.5 GB of memory)
source "$(dirname "$0")/lib.sh"

with_docker=1
with_scanner=1
for arg in "$@"; do
  case "$arg" in
    --no-docker) with_docker=0 ;;
    --no-scanner) with_scanner=0 ;;
    *) die "Unknown option: $arg" ;;
  esac
done

info "Checking prerequisites"
have node || die "Node.js 22.13+ is required (see .nvmrc)."
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)' \
  || die "Node.js 22.13+ is required; found $(node --version)."
if ! have pnpm; then
  have corepack || die "pnpm 10.28.0 is required. Install it or enable corepack."
  info "Enabling pnpm through corepack"
  corepack enable
fi
have uv || warn "uv not found: the Python ai-worker will be skipped (https://docs.astral.sh/uv/)."
if [[ $with_docker == 1 ]]; then
  have docker || die "Docker is required for the local database. Re-run with --no-docker to skip it."
fi

if [[ ! -f .env ]]; then
  info "Creating .env from .env.example (local-only values)"
  cp .env.example .env
else
  info ".env already exists; leaving it unchanged"
fi
# Provider tokens are sealed with a key that is generated per machine, never committed.
if ! grep -qE '^CONNECT_TOKEN_KEYS=.+' .env; then
  info "Generating a local token key for Origin Connect (CONNECT_TOKEN_KEYS in .env)"
  key="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64"))')"
  sed -i.bak '/^CONNECT_TOKEN_KEYS=/d' .env && rm -f .env.bak
  printf '\nCONNECT_TOKEN_KEYS=local:%s\n' "$key" >> .env
fi

info "Installing JavaScript dependencies"
pnpm install --frozen-lockfile

if have uv; then
  info "Installing Python dependencies (services/ai-worker)"
  (cd services/ai-worker && uv sync --frozen)
fi

info "Building workspace packages"
pnpm build

if [[ $with_docker == 1 ]]; then
  start_containers "$with_scanner"
  load_env
  check_db_port
  info "Applying database migrations (creates the service roles and tables)"
  pnpm --silent db:migrate || die "Migrations failed (see above). Fix it, then run: pnpm db:migrate"
  info "Creating the local storage buckets"
  ensure_buckets
fi

info "Done. Start everything with: scripts/dev.sh"
