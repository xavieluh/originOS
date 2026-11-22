"""Structured JSON-lines logging, field names aligned with the TypeScript services."""

from __future__ import annotations

import json
import logging
import sys
import time
from typing import Any

_LEVELS = {"DEBUG": 20, "INFO": 30, "WARNING": 40, "ERROR": 50, "CRITICAL": 60}
_CREDENTIAL_KEYS = {
    "password",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "api_key",
    "authorization",
    "cookie",
    "database_url",
}


def redact(fields: dict[str, Any]) -> dict[str, Any]:
    """Censor credential-named keys at the top level and one level down."""
    out: dict[str, Any] = {}
    for key, value in fields.items():
        if key.lower() in _CREDENTIAL_KEYS:
            out[key] = "[REDACTED]"
        elif isinstance(value, dict):
            out[key] = {
                k: "[REDACTED]" if k.lower() in _CREDENTIAL_KEYS else v for k, v in value.items()
            }
        else:
            out[key] = value
    return out


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        fields = getattr(record, "fields", {})
        payload = {
            "level": _LEVELS.get(record.levelname, 30),
            "time": int(time.time() * 1000),
            "service": "ai-worker",
            "msg": record.getMessage(),
            **redact(fields if isinstance(fields, dict) else {}),
        }
        return json.dumps(payload, default=str)


def configure_logging(level: str) -> logging.Logger:
    logger = logging.getLogger("originos")
    logger.handlers.clear()
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    logger.setLevel(level.upper())
    logger.propagate = False
    return logger
