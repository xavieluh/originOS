#!/usr/bin/env bash
# Shared helpers for scripts/*.sh. Sourced, not executed.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# Export variables from .env without printing them.
load_env() {
  if [[ -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
  fi
}

compose() {
  if have docker && ! docker info >/dev/null 2>&1; then
    die "Docker is installed but not running. Start Docker Desktop (or the Docker daemon) and try again."
  fi
  if docker compose version >/dev/null 2>&1; then docker compose "$@";
  elif have docker-compose; then docker-compose "$@";
  else die "Docker Compose is required (https://docs.docker.com/compose/install/)."; fi
}

# Warn when DATABASE_URL points at a different local port than the one compose
# publishes Postgres on: the services would reach another Postgres, or none.
check_db_port() {
  local url="${DATABASE_URL:-}" port
  [[ -n "$url" ]] || return 0
  if [[ "$url" =~ @(127\.0\.0\.1|localhost):([0-9]+)/ ]]; then
    port="${BASH_REMATCH[2]}"
    if [[ "$port" != "${POSTGRES_HOST_PORT:-5432}" ]]; then
      warn "DATABASE_URL uses port $port, but compose publishes Postgres on ${POSTGRES_HOST_PORT:-5432} (POSTGRES_HOST_PORT). Make them match in .env."
    fi
  fi
}

# Stop before starting the services if the database is unreachable or not
# migrated, with the fix, instead of failing later on the first sign-up.
require_db_ready() {
  [[ -n "${DATABASE_URL:-}" ]] || { warn "DATABASE_URL is not set: the API and worker start without a database."; return 0; }
  [[ -f packages/db/dist/status-cli.js ]] || die "Workspace packages are not built. Run scripts/bootstrap.sh (or pnpm build) first."
  check_db_port
  local code=0
  pnpm --silent db:status || code=$?
  case $code in
    0) ;;
    2) die "Not starting: the database needs migrations. Run: pnpm db:migrate" ;;
    *) die "Not starting: fix the database problem above, then run scripts/dev.sh again." ;;
  esac
}

# Containers for local development. The malware scanner (ClamAV) needs about
# 1.5 GB of memory and a minute to start; pass with_scanner=0 to leave it out
# (uploads then stay in quarantine as "not scanned").
start_containers() {
  if [[ "${1:-1}" == 1 ]]; then
    info "Starting Postgres (pgvector), object storage, Mailpit and the malware scanner (first start takes a minute)"
    compose --profile scanner up -d --wait
  else
    info "Starting Postgres (pgvector), object storage and Mailpit (no malware scanner)"
    compose up -d --wait
  fi
}

# Create the local storage buckets (idempotent). Warns instead of failing:
# everything except uploads works without them.
ensure_buckets() {
  [[ -n "${S3_ENDPOINT:-}" ]] || return 0
  pnpm --silent storage:setup || warn "Could not create the storage buckets; uploads will fail until: pnpm storage:setup"
}
