#!/usr/bin/env bash
# Start the built web, api and worker against the local database, check their
# health endpoints and the web page, then stop them. Used by CI and locally:
#   pnpm build && docker compose up -d --wait && scripts/smoke.sh
source "$(dirname "$0")/lib.sh"
load_env

: "${DATABASE_URL:?DATABASE_URL must be set (see .env.example)}"
# info level so request logs (with correlation IDs) are written.
export NODE_ENV="${NODE_ENV:-development}" LOG_LEVEL=info
LOG_DIR="$(mktemp -d)"
pids=()
cleanup() {
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT

start() { # name dir
  (cd "$2" && exec node "${3:-dist/main.js}") >"$LOG_DIR/$1.log" 2>&1 &
  pids+=("$!")
}
start api apps/api
start worker apps/worker
(cd apps/web && NEXT_TELEMETRY_DISABLED=1 exec node_modules/.bin/next start --hostname 127.0.0.1 --port 3000) \
  >"$LOG_DIR/web.log" 2>&1 &
pids+=("$!")

wait_for() { # url expected_status
  for _ in $(seq 1 60); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "$1" || true)"
    [[ "$code" == "$2" ]] && return 0
    sleep 0.5
  done
  warn "Timed out waiting for $1 (last status $code). Logs in $LOG_DIR"
  for f in "$LOG_DIR"/*.log; do echo "--- $f"; tail -20 "$f"; done
  return 1
}

info "Waiting for health endpoints"
wait_for http://127.0.0.1:4000/health/ready 200
wait_for http://127.0.0.1:4050/health/ready 200
wait_for http://127.0.0.1:3000/api/health 200

check_ready() { # url
  body="$(curl -s -H 'x-correlation-id: smoke-test-0001' "$1")"
  echo "$body"
  [[ "$body" == *'"status":"ok"'* && "$body" == *'"database":{"status":"ok"'* ]] \
    || die "$1 is not ready with a working database"
}
check_ready http://127.0.0.1:4000/health/ready
check_ready http://127.0.0.1:4050/health/ready

info "Checking signed-out access is refused (Phase 04)"
code="$(curl -s -o /dev/null -w '%{http_code}' -H 'x-correlation-id: smoke-test-0001' http://127.0.0.1:4000/v1/me)"
[[ "$code" == "401" ]] || die "GET /v1/me without a session returned $code, expected 401"
location="$(curl -s -o /dev/null -w '%{redirect_url}' http://127.0.0.1:3000/home)"
[[ "$location" == *"/sign-in?next=%2Fhome" ]] || die "signed-out /home did not redirect to sign-in ($location)"
for path in /v1/me/permissions /v1/me/consents /v1/organization/grants /v1/organization/agents; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:4000$path")"
  [[ "$code" == "401" ]] || die "GET $path without a session returned $code, expected 401 (Phase 05)"
done

info "Checking the sign-in page sees a working account service"
config="$(curl -s http://127.0.0.1:4000/v1/auth-config)"
echo "$config"
[[ "$config" == *'"accounts":"available"'* ]] || die "accounts are not available on the API"
page="$(curl -s http://127.0.0.1:3000/sign-in)"
[[ "$page" == *"Sign in to OriginOS"* && "$page" != *"API is unreachable"* ]] \
  || die "sign-in page does not show a usable form"

info "Checking the correlation ID reached the API log"
grep -q '"correlationId":"smoke-test-0001"' "$LOG_DIR/api.log" || die "correlation ID missing from API logs"

info "Smoke test passed: web, api, worker and database are up"
