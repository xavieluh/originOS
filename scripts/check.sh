#!/usr/bin/env bash
# Run every check CI runs that can run locally. Exits non-zero on the first failure.
#   scripts/check.sh          static checks, unit tests, build
#   scripts/check.sh --db     also database integration tests (needs TEST_DATABASE_URL and
#                             `docker compose --profile scanner up -d --wait`, which includes ClamAV)
source "$(dirname "$0")/lib.sh"

info "Secrets: .env must be git-ignored"
git check-ignore -q .env || die ".env is not git-ignored"
git check-ignore -q .env.local || die ".env.local is not git-ignored"
! git check-ignore -q .env.example || die ".env.example must stay committed"
if git ls-files --error-unmatch .env >/dev/null 2>&1; then die ".env is tracked by git"; fi

if have gitleaks; then
  info "Secrets: gitleaks over git history"
  gitleaks git --no-banner --redact --config .gitleaks.toml .
else
  warn "gitleaks not installed; skipping local secret scan (CI always runs it)."
fi

info "Formatting"
pnpm format:check
info "Lint, typecheck and unit tests"
pnpm check
info "Production build"
pnpm build

if [[ "${1:-}" == "--db" ]]; then
  load_env
  [[ -n "${TEST_DATABASE_URL:-}" ]] || die "TEST_DATABASE_URL is not set (see .env.example)."
  info "Database integration tests"
  pnpm test:integration
fi

info "All checks passed"
