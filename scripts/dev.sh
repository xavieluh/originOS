#!/usr/bin/env bash
# Start local infrastructure and every TypeScript process in watch mode,
# with variables from .env exported into each process. Stops first, with the
# fix, if the database is unreachable or needs migrations.
#   scripts/dev.sh               containers + pnpm dev
#   scripts/dev.sh --no-docker   pnpm dev only
source "$(dirname "$0")/lib.sh"

[[ -f .env ]] || die "No .env file. Run scripts/bootstrap.sh first."
if [[ "${1:-}" != "--no-docker" ]]; then
  info "Starting Postgres (pgvector) and object storage"
  compose up -d --wait
fi
load_env
require_db_ready
info "Starting web :3000, api :4000, worker :4050, mcp-server :4100, telemetry :4200, media-validator :4300"
exec pnpm dev
