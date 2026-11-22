# BUILD PHASE 45 — Integrated OriginOS flagship workflow

**Workstream:** Integration  
**Goal:** Demonstrate the complete joined-up product rather than 15 independent screens.  
**Prerequisites:** Previous numbered phase completed and passing

## Execution instruction to Claude Code

This is an **implementation instruction**, not a request for a brainstorm, mockup, slide deck, or short plan. Read `CLAUDE.md`, `docs/MASTER_SPEC.md`, `docs/BUILD_STATE.md`, `docs/DECISIONS.md`, and this exact file. Inspect the real repository. Produce a concise plan with paths, dependencies, data migrations, security implications and tests; then implement the phase in working source code. **Do not stop after planning** unless a required user authorization or external credential blocks the operation. Do not broaden to unrelated phases.

### Required engineering deliverables
1. Implement real end-to-end flow: identity-reviewed creator submits research article -> versions and provenance -> EvidenceGraph links claims to source spans -> instrumented Claude agent reviews -> AgentTrust records observed actions -> Slack approval -> PublisherOS publishes via configured test provider -> OriginGraph links resulting artifact -> MCP query retrieves evidence-backed history.
2. build guided demo seeded with clearly labeled synthetic fixtures and real external provider smoke tests where configured.
3. create usable walkthrough and failure scenarios.

### Acceptance checks — actually execute and report results
- [ ] automated integration suite passes locally with mock/sandbox provider only where clearly labeled.
- [ ] all artifacts linked by identifiers.
- [ ] failed approvals block publication.
- [ ] MCP reads same persisted trace, not invented output.

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

**Do not mark Phase 45 COMPLETE unless all applicable acceptance tests have actually passed.**
