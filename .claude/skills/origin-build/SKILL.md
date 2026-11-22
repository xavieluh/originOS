---
name: origin-build
description: Implement one numbered OriginOS build phase (00-47) from prompts/NN-*.md, run its acceptance checks, and update BUILD_STATE and ACCEPTANCE_MATRIX. Use only when the user runs /origin-build NN.
argument-hint: "<NN> (two-digit phase, 00-47)"
disable-model-invocation: true
---

# OriginOS build phase $ARGUMENTS

You are implementing **exactly one** OriginOS build phase. `CLAUDE.md` holds the standing rules; this skill is the procedure. Where they differ, `CLAUDE.md` wins.

## 0. Resolve the phase
1. Take the first argument (`$ARGUMENTS`). It must be a two-digit number 00-47. Accept `7` as `07`. Anything else: stop and ask which phase.
2. Find the entry in `PHASES.json` whose `n` equals that number. Use its `filename` to open `prompts/<filename>`. If the file or entry is missing, stop and report; do not improvise a phase.
3. Note the entry's `title`, `lane`, `goal`, `tasks` and `checks`. The prompt file is authoritative if it disagrees with `PHASES.json`; record the mismatch in the report.

## 1. Read before touching code
Read, in full: `CLAUDE.md`, `docs/MASTER_SPEC.md`, `docs/BUILD_STATE.md`, `docs/DECISIONS.md`, `docs/ACCEPTANCE_MATRIX.md`, `docs/THREAT_MODEL.md`, and the phase prompt. Then inspect the actual repository (`git status`, tree, package manifests, existing tests). Do not trust BUILD_STATE over the code.

## 2. Gate on prerequisites
- If any lower-numbered phase is not `COMPLETE` in `docs/BUILD_STATE.md`, list those phases and ask the user whether to continue anyway. Do not silently skip ahead.
- If the working tree has uncommitted changes you did not make, stop and ask.
- If this phase is already `COMPLETE`, say so and ask whether to re-run or audit (`/origin-audit NN`) instead.

## 3. Plan (short, then proceed)
Write a scoped plan: paths to create/change, dependencies on earlier phases, migrations, API/contract changes, security and tenant-isolation implications, tests to add, and any external credentials needed. Flag conflicts with existing code or ADRs. Then **continue to implementation** — the phase prompt forbids stopping after planning unless blocked by authorization or credentials.

## 4. Implement the vertical slice
- Stay inside this phase. Do not refactor unrelated working areas.
- Before choosing or upgrading any SDK, check current official docs and add an ADR row to `docs/DECISIONS.md` with the exact version and source URL.
- Add migrations; never rewrite existing tables in place.
- Missing credentials: build the local adapter, contract and tests, show an explicit "setup required" state, and write a **BLOCKED** checklist. Never fake a successful external connection or seed production with mock data.

## 5. Stop points that need the user
Ask and wait before: deploying; publishing or sending anything external; issuing identity credentials or using real signing keys; paid API calls beyond agreed limits; spending money; deleting real data; force-pushing or rewriting git history. Never write secrets to files, logs or commits.

## 6. Verify for real
Run every applicable check — typecheck, lint, unit, integration, migrations up/down, browser E2E, security checks — plus each acceptance check from the phase prompt. Record the **exact commands and results**. Fix regressions and re-run what failed. If a check cannot run, say exactly why; that check is NOT RUN, not passed.

## 7. Update continuity files
- `docs/BUILD_STATE.md`: set the phase row to `COMPLETE` only if every applicable acceptance check passed; otherwise `IN PROGRESS` or `BLOCKED` with the blocker. Update "Current phase", "Last fully completed phase", and fill the session handoff template.
- `docs/ACCEPTANCE_MATRIX.md`: set Result (PASS / FAIL / NOT RUN / BLOCKED) and Evidence (command, test file, or path) for this phase's row.
- `docs/DECISIONS.md`: any consequential decision made.

## 8. Final report (format required by the phase prompt)
1. Files and modules changed. 2. Working user journeys. 3. Exact checks executed and results. 4. Security and permissions. 5. External credentials/blockers. 6. Remaining gaps. 7. Acceptance status and next phase.

End by suggesting `/origin-audit NN` before moving on. Commit on a feature branch, push it and open a pull request for review; never commit to `main`, never merge, and never force-push or rewrite history without the user's approval.
