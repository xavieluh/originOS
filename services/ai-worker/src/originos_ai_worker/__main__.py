"""Entry point: `uv run python -m originos_ai_worker` prints a health report and exits."""

from __future__ import annotations

import json
import sys

from .config import EnvValidationError, load_config
from .health import health_report


def main() -> int:
    try:
        config = load_config()
    except EnvValidationError as error:
        print(str(error), file=sys.stderr)
        return 1
    print(json.dumps(health_report(config)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
