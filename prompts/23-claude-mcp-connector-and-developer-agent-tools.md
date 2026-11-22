# BUILD PHASE 23 — Claude MCP connector and developer agent tools

**Workstream:** Integrations  
**Goal:** Make OriginOS data and approved operations accessible from Claude and other MCP clients.  
**Prerequisites:** Previous numbered phase completed and passing

## Execution instruction to Claude Code

This is an **implementation instruction**, not a request for a brainstorm, mockup, slide deck, or short plan. Read `CLAUDE.md`, `docs/MASTER_SPEC.md`, `docs/BUILD_STATE.md`, `docs/DECISIONS.md`, and this exact file. Inspect the real repository. Produce a concise plan with paths, dependencies, data migrations, security implications and tests; then implement the phase in working source code. **Do not stop after planning** unless a required user authorization or external credential blocks the operation. Do not broaden to unrelated phases.

### Required engineering deliverables
1. Implement secure remote MCP server using current official SDK and supported authentication/authorization spec.
2. expose scoped read tools search_agent_history/get_run/verify_work/search_evidence/get_creator and approval-request tools.
3. use minimal tool descriptions, pagination, rate limits and tenant token audience checks.
4. simulate Claude consumer with protocol tests.
5. confirm unsupported private history access is never implied.

### Acceptance checks — actually execute and report results
- [ ] unauthenticated MCP requests rejected.
- [ ] cross-tenant tool call blocked.
- [ ] tools return source-linked structured results.
- [ ] human approvals cannot be bypassed via MCP.

### Cross-cutting constraints
- Reuse canonical identities, events, authorization and contracts; do not create a parallel database or shadow app for this module.
- Implement UI, API, persistence, background processing and tests **as applicable**. Every working control must lead to implemented behavior; empty states are honest.
- Enforce organization boundaries; record important decisions and observed events without logging secrets or unapproved private content.
- Use current official integration documentation. If provider credentials are missing, finish local adapter/contracts/tests and document an accurate BLOCKED external smoke test; do not claim a live integration.
- No AI model may be used as proof of human authorship, cryptographic validity, legal ownership or factual certainty.
- For external writes, irreversible changes, signing credentials or purchases, retain explicit human approval and do not make unapproved real-world changes.
- Run the applicable checks (typecheck, lint, unit, integration, migrations, browser E2E, security checks), fix failures, then update `docs/BUILD_STATE.md`, `docs/ACCEPTANCE_MATRIX.md`, and ADRs. If tests cannot run, state exactly why.

### Required final report format
1. Files and modules changed. 2. Working user journeys. 3. Exact checks executed and results. 4. Security and permissions. 5. External credentials/blockers. 6. Remaining gaps. 7. Acceptance status and next phase.

**Do not mark Phase 23 COMPLETE unless all applicable acceptance tests have actually passed.**
