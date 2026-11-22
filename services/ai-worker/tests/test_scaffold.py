from datetime import UTC, datetime

import pytest

from originos_ai_worker.config import EnvValidationError, load_config
from originos_ai_worker.health import health_report


def test_defaults():
    config = load_config({})
    assert config.log_level == "info"
    assert config.gateway_url is None


def test_invalid_values_are_named_without_echoing_them():
    with pytest.raises(EnvValidationError) as excinfo:
        load_config({"LOG_LEVEL": "loud", "AI_GATEWAY_URL": "ftp://secret-host"})
    message = str(excinfo.value)
    assert "LOG_LEVEL" in message and "AI_GATEWAY_URL" in message
    assert "secret-host" not in message and "loud" not in message


def test_health_report_matches_contract_shape():
    report = health_report(load_config({}), now=datetime(2026, 11, 22, tzinfo=UTC))
    assert report["service"] == "ai-worker"
    assert report["status"] == "ok"
    assert report["checkedAt"] == "2026-11-22T00:00:00.000Z"
    assert report["checks"]["aiGateway"]["status"] == "not_configured"


def test_configured_gateway_is_not_claimed_reachable():
    report = health_report(load_config({"AI_GATEWAY_URL": "http://127.0.0.1:4000"}))
    assert report["checks"]["aiGateway"]["status"] != "ok"
