---
name: origin-audit
description: Independently audit an OriginOS build phase (or the whole build) against its prompt, acceptance checks, CLAUDE.md rules and the threat model, and verify BUILD_STATE claims against the real code and tests. Use when the user runs /origin-audit or asks for an independent phase review.
argument-hint: "[NN | all] (defaults to the last phase marked COMPLETE)"
disable-model-invocation: true
---

# OriginOS independent audit: $ARGUMENTS

Your job is to **find what is wrong or overstated**, not to confirm success. Assume nothing in `docs/BUILD_STATE.md` or a previous report is true until you have checked it in the code or by running it.

## 0. Scope
- `NN` (00-47): audit that phase. Look it up in `PHASES.json` (`n`, `filename`, `checks`) and read `prompts/<filename>`.
- `all`: audit every phase marked COMPLETE or IN PROGRESS, plus cross-cutting rules.
- No argument: audit the "Last fully completed phase" in `docs/BUILD_STATE.md`; if none, audit repository hygiene and say no phase is complete.

## 1. Read
`CLAUDE.md`, `docs/MASTER_SPEC.md`, `docs/BUILD_STATE.md`, `docs/ACCEPTANCE_MATRIX.md`, `docs/DECISIONS.md`, `docs/THREAT_MODEL.md`, the phase prompt(s), and `git log` since the phase began.

## 2. Delegate specialist reviews
Run these subagents (in parallel where possible) with the phase number, prompt path and changed paths:
- **origin-acceptance-verifier** — re-runs each acceptance check and the test/lint/type commands; reports exact output.
- **origin-security-reviewer** — tenant isolation, authz, secrets, OAuth/webhooks/MCP, redaction, consent.
- **origin-claims-auditor** — honesty: fake integrations, mock data, overstated labels, AI-as-proof, docs claiming unbuilt features.
If subagents are unavailable, do the three reviews yourself in that order.

## 3. Rules
- Read-only on source code. Do not fix anything during an audit; report it.
- Do not deploy, call paid APIs, use real credentials or contact external services. Local tests only.
- Each finding needs evidence: `path:line`, a command and its output, or a missing file. No evidence, no finding.
- Severity: **BLOCKER** (acceptance check fails, security/tenant hole, false claim of a working feature), **MAJOR** (rule violation or missing test for a required check), **MINOR** (quality, docs drift).

## 4. Output
Write the report to `docs/audits/<NN or all>-<YYYY-MM-DD>.md` (create the folder if needed) and print a summary:
1. Scope and commit audited. 2. Acceptance checks: PASS / FAIL / NOT RUN, each with evidence. 3. Findings by severity. 4. BUILD_STATE / ACCEPTANCE_MATRIX entries that overstate status. 5. Verdict: **CONFIRMED COMPLETE**, **INCOMPLETE**, or **CANNOT VERIFY** (and why). 6. Fixes to make before the next phase.

The only files an audit may write are that report. If the verdict contradicts `docs/BUILD_STATE.md`, say so and ask the user whether to downgrade the status there; do not change it yourself.
