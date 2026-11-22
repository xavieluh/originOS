#!/usr/bin/env bash
# Run the web E2E suite inside the pinned Playwright image (same as CI), so
# visual baselines match. Requires Docker and a prior `pnpm build`.
#   scripts/e2e-docker.sh                       run everything
#   scripts/e2e-docker.sh --update-snapshots    regenerate visual baselines
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v1.65.1-noble}"
exec docker run --rm --network host --ipc host \
  -v "$ROOT:/work" -w /work/apps/web \
  -e CI="${CI:-}" -e HOME=/tmp \
  --user "$(id -u):$(id -g)" \
  "$IMAGE" ./node_modules/.bin/playwright test "$@"
