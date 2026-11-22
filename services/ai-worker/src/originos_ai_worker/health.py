"""Health report matching the HealthResponse contract in packages/contracts."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from . import __version__
from .config import WorkerConfig


def health_report(config: WorkerConfig, now: datetime | None = None) -> dict[str, Any]:
    checked_at = (now or datetime.now(UTC)).isoformat(timespec="milliseconds")
    gateway = (
        {"status": "not_configured", "detail": "AI_GATEWAY_URL is not set"}
        if config.gateway_url is None
        # Configured but not contacted: the gateway endpoint does not exist until Phase 15,
        # so we do not report it as reachable.
        else {"status": "not_configured", "detail": "AI gateway client arrives in Phase 15"}
    )
    return {
        "service": "ai-worker",
        "status": "ok",
        "version": __version__,
        "checkedAt": checked_at.replace("+00:00", "Z"),
        "checks": {"aiGateway": gateway},
    }
