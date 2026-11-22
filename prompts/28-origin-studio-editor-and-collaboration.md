# BUILD PHASE 28 — Origin Studio editor and collaboration

**Workstream:** Creation  
**Goal:** Develop a fully functional provenance-aware editor and research workspace.  
**Prerequisites:** Previous numbered phase completed and passing

## Execution instruction to Claude Code

This is an **implementation instruction**, not a request for a brainstorm, mockup, slide deck, or short plan. Read `CLAUDE.md`, `docs/MASTER_SPEC.md`, `docs/BUILD_STATE.md`, `docs/DECISIONS.md`, and this exact file. Inspect the real repository. Produce a concise plan with paths, dependencies, data migrations, security implications and tests; then implement the phase in working source code. **Do not stop after planning** unless a required user authorization or external credential blocks the operation. Do not broaden to unrelated phases.

### Required engineering deliverables
1. Implement Tiptap/ProseMirror editor, source cards, citations, footnotes, comments, version history and autosave.
2. provide team edit roles and optimistic concurrency, with real-time sync only if proven necessary.
3. connect AI-assisted drafting via gateway with explicit user actions and AI-use events.
4. add import/export to Markdown/HTML and citation references.
5. maintain authorship attribution and snapshot integrity.

### Acceptance checks — actually execute and report results
- [ ] draft survives reload and concurrent update conflict.
- [ ] citations maintain stable source references.
- [ ] AI-assisted segments have clear disclosure state.
- [ ] editor exports valid content.

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

**Do not mark Phase 28 COMPLETE unless all applicable acceptance tests have actually passed.**
