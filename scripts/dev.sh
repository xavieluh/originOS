#!/usr/bin/env bash
# Start local infrastructure and every TypeScript process in watch mode,
# with variables from .env exported into each process. Stops first, with the
# fix, if the database is unreachable or needs migrations.
#   scripts/dev.sh               containers + pnpm dev
#   scripts/dev.sh --no-docker   pnpm dev only
#   scripts/dev.sh --no-scanner  containers without the malware scanner
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

[[ -f .env ]] || die "No .env file. Run scripts/bootstrap.sh first."
[[ $with_docker == 1 ]] && start_containers "$with_scanner"
load_env
require_db_ready
[[ $with_docker == 1 ]] && ensure_buckets
info "Starting web :3000, api :4000, worker :4050, mcp-server :4100, telemetry :4200, media-validator :4300"
exec pnpm dev
