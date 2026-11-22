# BUILD PHASE 46 — Open-source governance, developer community and docs

**Workstream:** Launch  
**Goal:** Prepare a credible open-source launch and contribution path.  
**Prerequisites:** Previous numbered phase completed and passing

## Execution instruction to Claude Code

This is an **implementation instruction**, not a request for a brainstorm, mockup, slide deck, or short plan. Read `CLAUDE.md`, `docs/MASTER_SPEC.md`, `docs/BUILD_STATE.md`, `docs/DECISIONS.md`, and this exact file. Inspect the real repository. Produce a concise plan with paths, dependencies, data migrations, security implications and tests; then implement the phase in working source code. **Do not stop after planning** unless a required user authorization or external credential blocks the operation. Do not broaden to unrelated phases.

### Required engineering deliverables
1. Choose component licensing after reviewing dependency licenses and the open-core strategy.
2. create CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, support policy, architecture docs, example apps and SDK usage guides.
3. document trust assumptions, what is and is not verified, privacy and roadmap.
4. provide onboarding for creator/publisher/developer and maintainers.
5. prepare issue templates and changelog.

### Acceptance checks — actually execute and report results
- [ ] license scope is explicit per component.
- [ ] clean external contributor can run local dev from docs.
- [ ] no false endorsements or standards-compliance claims.
- [ ] vulnerability reporting path exists.

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

**Do not mark Phase 46 COMPLETE unless all applicable acceptance tests have actually passed.**
