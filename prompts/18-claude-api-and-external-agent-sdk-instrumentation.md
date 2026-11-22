# BUILD PHASE 18 — Claude API and external agent SDK instrumentation

**Workstream:** Agents  
**Goal:** Make AgentTrust model-agnostic beyond local Claude Code.  
**Prerequisites:** Previous numbered phase completed and passing

## Execution instruction to Claude Code

This is an **implementation instruction**, not a request for a brainstorm, mockup, slide deck, or short plan. Read `CLAUDE.md`, `docs/MASTER_SPEC.md`, `docs/BUILD_STATE.md`, `docs/DECISIONS.md`, and this exact file. Inspect the real repository. Produce a concise plan with paths, dependencies, data migrations, security implications and tests; then implement the phase in working source code. **Do not stop after planning** unless a required user authorization or external credential blocks the operation. Do not broaden to unrelated phases.

### Required engineering deliverables
1. Create TypeScript instrumentation SDK and documented adapters for Claude API/Agent SDK and one generic OpenTelemetry agent runtime.
2. distinguish model API requests from tool execution and downstream effects.
3. support automatic span parenting, tenant auth, sampling, retries and sensitive-data filters.
4. add minimal example instrumented research agent and contract tests.

### Acceptance checks — actually execute and report results
- [ ] instrumented sample run appears with linked tool events.
- [ ] absence of instrumentation is displayed as unknown.
- [ ] custom test agent emits valid events.
- [ ] model credentials remain server-side.

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

**Do not mark Phase 18 COMPLETE unless all applicable acceptance tests have actually passed.**
