"""Entry point: `uv run python -m originos_ai_worker` prints a health report and exits."""

from __future__ import annotations

import json
import sys

from .config import EnvValidationError, load_config
from .health import health_report
from .logging_setup import configure_logging


def main() -> int:
    try:
        config = load_config()
    except EnvValidationError as error:
        print(str(error), file=sys.stderr)
        return 1
    logger = configure_logging(config.log_level)
    logger.info("ai-worker scaffold started; no pipelines registered until Phase 24")
    print(json.dumps(health_report(config)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
