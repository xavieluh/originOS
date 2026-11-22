# BUILD PHASE 35 — Origin Automations workflow builder

**Workstream:** Automation  
**Goal:** Add constrained event-driven automation without becoming an unsafe autonomous system.  
**Prerequisites:** Previous numbered phase completed and passing

## Execution instruction to Claude Code

This is an **implementation instruction**, not a request for a brainstorm, mockup, slide deck, or short plan. Read `CLAUDE.md`, `docs/MASTER_SPEC.md`, `docs/BUILD_STATE.md`, `docs/DECISIONS.md`, and this exact file. Inspect the real repository. Produce a concise plan with paths, dependencies, data migrations, security implications and tests; then implement the phase in working source code. **Do not stop after planning** unless a required user authorization or external credential blocks the operation. Do not broaden to unrelated phases.

### Required engineering deliverables
1. Create workflow definitions, triggers on trusted events, conditional branches, schedules, retries, approval nodes, execution logs and quotas.
2. use durable workflow runtime selected in architecture.
3. build visual builder using React Flow plus JSON representation and validation.
4. add templates for new article review, agent incident and citation digest.
5. external actions require scopes and human approval per risk.

### Acceptance checks — actually execute and report results
- [ ] workflow resumes after simulated worker crash.
- [ ] duplicate trigger cannot double-execute non-idempotent action.
- [ ] invalid graphs rejected.
- [ ] approval node actually pauses and resumes.
- [ ] disabled workflow stops firing.

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

**Do not mark Phase 35 COMPLETE unless all applicable acceptance tests have actually passed.**
