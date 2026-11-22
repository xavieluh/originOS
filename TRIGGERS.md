# Copy-paste execution triggers for Claude Code

Run Claude Code from the OriginOS repository root. Type these **one at a time** in chronological order. The slash command works because this kit ships `.claude/skills/origin-build/SKILL.md`.

```text
/origin-build 00
/origin-build 01
/origin-build 02
/origin-build 03
/origin-build 04
/origin-build 05
/origin-build 06
/origin-build 07
/origin-build 08
/origin-build 09
/origin-build 10
/origin-build 11
/origin-build 12
/origin-build 13
/origin-build 14
/origin-build 15
/origin-build 16
/origin-build 17
/origin-build 18
/origin-build 19
/origin-build 20
/origin-build 21
/origin-build 22
/origin-build 23
/origin-build 24
/origin-build 25
/origin-build 26
/origin-build 27
/origin-build 28
/origin-build 29
/origin-build 30
/origin-build 31
/origin-build 32
/origin-build 33
/origin-build 34
/origin-build 35
/origin-build 36
/origin-build 37
/origin-build 38
/origin-build 39
/origin-build 40
/origin-build 41
/origin-build 42
/origin-build 43
/origin-build 44
/origin-build 45
/origin-build 46
/origin-build 47
```

### Plain-text fallback

If the custom skill is not detected, you can use:

```text
Read CLAUDE.md, docs/MASTER_SPEC.md, docs/BUILD_STATE.md, and prompts/00-product-contract-and-architecture.md. Implement Phase 00 fully in this repository; run its acceptance checks and update the state documents.
```

For another phase, replace `00-product-contract-and-architecture.md` with the exact filename from `PROMPT_INDEX.md`.

### Independent audit trigger

```text
/origin-audit 00
```

### Handoff trigger in new chats

```text
Before continuing, read CLAUDE.md, docs/MASTER_SPEC.md, docs/BUILD_STATE.md, and docs/DECISIONS.md. Report the last completed phase, outstanding blockers, and the next approved phase. Do not code until you have inspected the repository.
```
