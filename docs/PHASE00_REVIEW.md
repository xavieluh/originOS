# Phase 00 draft — review sheet

Drafted 2026-11-22 and added to `docs/` on a review branch (not merged). Every ADR is still **Proposed** and Phase 00 is DRAFTED, not COMPLETE. Nothing was implemented, and no check was run against code, because there is no code yet. The kit's original versions of the replaced docs are in the branch's first commit.

## What's in the drafts

| File | Replaces kit file? | What changed |
|---|---|---|
| `docs/ARCHITECTURE.md` | new | Personas, system context, 7 deployables, 7 API contexts, canonical model summary, navigation for all 15 modules, 6 data-flow diagrams (Mermaid), non-goals, release gates G0–G5, 12 kit conflicts and resolutions |
| `docs/DECISIONS.md` | yes (it had 1 row) | ADR-001 to ADR-012, all **Proposed** |
| `docs/PRODUCT_MAP.md` | yes (it was a stub) | All 15 modules: objects, context, nav, phases, dependencies, minimal real slice |
| `docs/ACCEPTANCE_MATRIX.md` | yes | Part A: 73-row capability traceability matrix (spec ref → module → phase → verification). Part B: the per-phase table regenerated in full (the old one was cut off mid-sentence) |
| `docs/THREAT_MODEL.md` | yes (it was a starter) | 9 trust boundaries, 19 threats with planned controls and the phase that verifies each |
| `docs/BUILD_STATE.md` | yes | Phase 00 = DRAFTED (not COMPLETE), blockers listed |

## Guesses that need your call (most consequential first)

1. **Add two units to Phase 01's scaffold**: `apps/worker` (TS job/outbox worker) and `services/media-validator` (sandboxed C2PA). The spec requires both functions, but Phase 01's list doesn't include them.
2. **Queue choice**: Postgres-backed queue (pg-boss or Graphile Worker, picked in Phase 07) now; Temporal re-evaluated at Phase 35. No Redis until needed.
3. **Postgres row-level security** as a second layer of tenant isolation (in addition to app checks).
4. **Telemetry store**: start in partitioned Postgres; only move to a columnar store if load tests say so.
5. **First AI provider adapter = Anthropic API**, with a second adapter in tests to prove swapability.
6. **Signing**: Ed25519 (or P-256 where KMS lacks it) with RFC 8785 JSON canonicalization.
7. **Navigation placement**: Automations and Marketplace under Integrations; Library under Research; Studio under Publish; Registry and CreatorRights under Trust; Intelligence on Home and ⌘K.
8. **Tenancy**: one workspace per org at first (model allows many).
9. **Schema-per-context** in Postgres (`core`, `trust`, `content`, `evidence`, `agents`, `connect`, `platform`, `telemetry`).
10. **Prefixed opaque IDs** (e.g. `wrk_` + UUIDv7/ULID).
11. Minimal "built" slice per module (PRODUCT_MAP notes).

## Decisions I made without marking them as guesses (they follow the spec, but you may disagree)

- Seven personas, splitting "organization admin" into team admin and enterprise admin (prompt 00 vs spec).
- MASTER_SPEC §3 entity names are canonical; other names are aliases (ADR-002).
- Python AI worker never calls model providers directly; only through the TS gateway.
- MCP server has no database access; it calls the API with a user-delegated token.

## To finish Phase 00

1. You review and answer the guesses (or say "accept all").
2. Fold your answers into the docs on this branch.
3. ADRs move from Proposed to Accepted; Phase 00 becomes COMPLETE in BUILD_STATE.
