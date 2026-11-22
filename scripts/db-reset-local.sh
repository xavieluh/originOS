#!/usr/bin/env bash
# Drop and re-create the application schemas in the LOCAL compose databases,
# then re-apply migrations. Refuses anything but the local compose stack.
source "$(dirname "$0")/lib.sh"
load_env
for url in "$DATABASE_URL" "$TEST_DATABASE_URL"; do
  [[ "$url" =~ @(127\.0\.0\.1|localhost):[0-9]+/ ]] || die "refusing to reset a non-local database"
done
for db in originos originos_test; do
  docker compose exec -T postgres psql -q -U originos -d "$db" -v ON_ERROR_STOP=1 \
    -c "drop schema if exists trust, content, evidence, agents, core, drizzle cascade;"
done
pnpm --filter @originos/db build >/dev/null
pnpm db:migrate
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:migrate
info "Local databases reset and migrated"
