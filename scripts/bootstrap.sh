#!/usr/bin/env bash
# One-time setup of a fresh checkout. Safe to re-run.
#   scripts/bootstrap.sh            install deps, create .env, start Postgres + object storage
#   scripts/bootstrap.sh --no-docker   skip containers (readiness then reports the DB as not configured)
source "$(dirname "$0")/lib.sh"

with_docker=1
[[ "${1:-}" == "--no-docker" ]] && with_docker=0

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

info "Installing JavaScript dependencies"
pnpm install --frozen-lockfile

if have uv; then
  info "Installing Python dependencies (services/ai-worker)"
  (cd services/ai-worker && uv sync --frozen)
fi

info "Building workspace packages"
pnpm build

if [[ $with_docker == 1 ]]; then
  info "Starting Postgres (pgvector) and object storage"
  compose up -d --wait
fi

info "Done. Start everything with: scripts/dev.sh"
