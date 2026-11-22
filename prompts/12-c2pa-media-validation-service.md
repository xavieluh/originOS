# BUILD PHASE 12 — C2PA media validation service

**Workstream:** Trust  
**Goal:** Provide real cryptographic Content Credentials inspection for supported media.  
**Prerequisites:** Previous numbered phase completed and passing

## Execution instruction to Claude Code

This is an **implementation instruction**, not a request for a brainstorm, mockup, slide deck, or short plan. Read `CLAUDE.md`, `docs/MASTER_SPEC.md`, `docs/BUILD_STATE.md`, `docs/DECISIONS.md`, and this exact file. Inspect the real repository. Produce a concise plan with paths, dependencies, data migrations, security implications and tests; then implement the phase in working source code. **Do not stop after planning** unless a required user authorization or external credential blocks the operation. Do not broaden to unrelated phases.

### Required engineering deliverables
1. Implement adapter using current CAI C2PA SDK (Node/Rust) verified against official docs.
2. parse supported manifests, validate content binding/trust chain/revocation where supported, report signature issues and metadata gaps.
3. isolate untrusted media parsing and constrain resource usage.
4. separate validated cryptographic properties from self-asserted AI-use and author identity.
5. include known-good, tampered, unsigned and unsupported fixtures.

### Acceptance checks — actually execute and report results
- [ ] valid fixture passes and modified media fails or reports breakage per SDK.
- [ ] unsigned is unverified not fraudulent.
- [ ] validation returns machine readable diagnostics.
- [ ] never display "human-authored guaranteed".

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

**Do not mark Phase 12 COMPLETE unless all applicable acceptance tests have actually passed.**
