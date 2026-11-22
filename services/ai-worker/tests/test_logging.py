import json
import logging

from originos_ai_worker.logging_setup import JsonFormatter, redact


def test_redacts_credentials_top_level_and_nested():
    out = redact({"token": "abc", "user": {"password": "hunter2", "name": "x"}, "n": 1})
    assert out == {"token": "[REDACTED]", "user": {"password": "[REDACTED]", "name": "x"}, "n": 1}


def test_formatter_emits_json_line_with_correlation_id():
    record = logging.LogRecord("originos", logging.WARNING, __file__, 1, "probe", None, None)
    record.fields = {"correlationId": "corr-123456", "api_key": "sk-secret"}
    line = JsonFormatter().format(record)
    parsed = json.loads(line)
    assert parsed["level"] == 40 and parsed["msg"] == "probe"
    assert parsed["correlationId"] == "corr-123456"
    assert "sk-secret" not in line
