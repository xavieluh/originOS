"""OriginOS research/AI worker.

Phase 01 scaffold. Document parsing, span anchoring and claim extraction arrive
in Phases 24-25. This worker never calls model providers directly: every model
call goes through the API's AI gateway (ADR-004), which arrives in Phase 15.
"""

__version__ = "0.0.0"
