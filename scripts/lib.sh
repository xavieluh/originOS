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
  if docker compose version >/dev/null 2>&1; then docker compose "$@";
  elif have docker-compose; then docker-compose "$@";
  else die "Docker Compose is required (https://docs.docker.com/compose/install/)."; fi
}
