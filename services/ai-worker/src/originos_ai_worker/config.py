"""Environment validation. Errors name variables, never their values."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass

_LOG_LEVELS = {"critical", "error", "warning", "info", "debug"}


class EnvValidationError(ValueError):
    """Raised when the environment is invalid. The message is safe to log."""


@dataclass(frozen=True)
class WorkerConfig:
    log_level: str
    # Base URL of the API's internal AI gateway endpoint. Optional until Phase 15.
    gateway_url: str | None


def load_config(source: Mapping[str, str] | None = None) -> WorkerConfig:
    env = os.environ if source is None else source
    problems: list[str] = []

    log_level = (env.get("LOG_LEVEL") or "info").lower()
    if log_level not in _LOG_LEVELS:
        problems.append(f"LOG_LEVEL: must be one of: {', '.join(sorted(_LOG_LEVELS))}")

    gateway_url = env.get("AI_GATEWAY_URL") or None
    if gateway_url is not None and not gateway_url.startswith(("http://", "https://")):
        problems.append("AI_GATEWAY_URL: must be an http(s) URL")

    if problems:
        details = "\n  - ".join(problems)
        raise EnvValidationError(f"Invalid environment for ai-worker:\n  - {details}")
    return WorkerConfig(log_level=log_level, gateway_url=gateway_url)
