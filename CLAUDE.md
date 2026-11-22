# CLAUDE.md — OriginOS Standing Build Instructions

> This file is the concise, persistent instruction entry point. The full product and engineering contract is in `docs/MASTER_SPEC.md`. The numbered build prompts are in `prompts/`. **Always read both this file and the master spec before implementing a phase.**

## The mission
Build **OriginOS**: one evidence-centered, open-core platform connecting verified creator identity, content provenance, AI-agent accountability, scientific evidence, editorial publishing, creator licensing, discovery, automation, analytics, and developer APIs. It must be a functioning product, not a decorative prototype or disconnected collection of apps.

## Non-negotiable engineering behavior
1. Read `docs/MASTER_SPEC.md`, `docs/BUILD_STATE.md`, `docs/DECISIONS.md` and the requested `prompts/NN-*.md` before changing code. Summarize dependencies and conflicts in the implementation plan.
2. Execute **one numbered build phase per invocation**. Design for the complete platform but implement the phase's real vertical slice, including UI, backend, database, permission enforcement, error handling, and tests where relevant.
3. Keep a single cohesive monorepo and canonical domain schemas. Prefer modular monolith + workers over premature microservices. Reuse components, services and schemas; don't duplicate features across modules.
4. Never claim an unfinished route, integration, workflow, button, dashboard, AI model, or cryptographic proof works. No production mock data. Fixture data may be used in clearly labeled dev/test/demo contexts. Disabled external integrations must have explicit setup-required states.
5. Security-first: deny by default; enforce tenant isolation in backend and storage; never expose credentials or log secrets; redact AI-agent traces; honor consent, deletion and retention rules; validate webhooks, OAuth, MCP tokens, signed receipts and C2PA manifests.
6. Cryptography is deterministic. C2PA validates supported provenance claims, not human authorship or factual truth. Identity evidence and AI-use disclosures require accurate assurance labels. LLM outputs never count as proof by themselves.
7. Claude integration: connect via MCP, authenticated APIs, official hooks and opt-in telemetry. **Do not claim access to arbitrary private Claude account history or uninstrumented agent activity.** Enforcement only covers actions actually routed through supported controls.
8. AI is optional infrastructure, not the source of truth. Deterministic services continue when models fail. Use provider abstraction, budgets, human approvals for consequential actions, source-linked outputs and eval fixtures.
9. Check the latest official docs before selecting SDK versions or assuming API availability. Record exact chosen versions and reason in `docs/DECISIONS.md`; never invent API methods or assume undocumented access.
10. For each phase: inspect repo; make scoped plan; implement; run real tests, lint, types, migrations and where applicable browser E2E; fix regressions; update `docs/BUILD_STATE.md` and `docs/ACCEPTANCE_MATRIX.md`; identify blockers and the next phase. Do not mark a phase completed unless acceptance checks actually pass.
11. Never deploy, publish external content, issue identity credentials, spend money, make paid API calls beyond agreed limits, delete real data, or send external communications without user authorization. Keep any required human confirmation points.
12. Do not refactor unrelated working areas. Add migrations rather than replacing tables in-place. Preserve source data and backwards compatibility unless explicitly approved.
13. Code must be readable, accessible, typed, observable, and maintainable. Prefer small well-tested functions, explicit error states, correlation IDs, API contracts, and clear docs.

## Architecture defaults
- Monorepo: pnpm + Turborepo + TypeScript strict.
- Web: Next.js, React, Tailwind, shared accessible design system, Tiptap for editing and Cytoscape/React Flow where needed.
- API: NestJS with Fastify adapter, documented REST/OpenAPI, versioned domain contracts.
- Database: PostgreSQL + Drizzle + pgvector; relational graph edges first; Redis only where justified.
- Storage: S3-compatible, scoped URLs, safe ingestion; background workflow engine chosen by ADR (start pragmatically, Temporal if long-lived complex workflows justify it).
- AI: provider-agnostic gateway + Python workers for research tasks; optional local inference only when workload justifies.
- Trust: CAI C2PA SDK for supported media, cryptographic signing via KMS/secure key interface, verifiable credentials only on validated spec profile.
- Telemetry: OpenTelemetry ingest + authenticated custom collectors, retained in appropriately partitioned storage.
- Integrations: OAuth 2.0, signed webhooks, secure MCP server, Slack Bolt app, GitHub App, publishing connectors.
- CI/CD: GitHub Actions + Docker + managed cloud + IaC after staging is ready.

## Product scope — 15 connected modules
1 AgentTrust · 2 PublisherOS · 3 EvidenceGraph · 4 OriginGraph · 5 IdentityMesh · 6 CreatorRights · 7 Verified Human · 8 Origin Studio · 9 Origin Library · 10 Origin Intelligence · 11 Origin Automations · 12 Origin Registry · 13 Origin Analytics · 14 Origin Connect · 15 Origin Marketplace.
All share identity, objects, relationships, audit events, permissions, integrations, search and billing. The public directory, private workspace and developer platform are separate UX surfaces within one product.

## Required phase completion report
- Phase ID/title; implemented paths; migrations and API changes; tests executed with exact commands and pass/fail; security/privacy implications; external setup required; unresolved defects; acceptance checks status; updates to `docs/BUILD_STATE.md` and `docs/ACCEPTANCE_MATRIX.md`; suggested next phase.
- If blocked by credentials or environment, implement locally testable adapters/contracts and write a **BLOCKED** setup checklist. Never invent successful external connections.

## Trigger
Use `/origin-build NN` in Claude Code, where `NN` is a two-digit phase number (00–47). The skill reads the relevant `prompts/NN-*.md` file. Or paste: `Read CLAUDE.md and prompts/NN-...md; implement the phase and run its acceptance checks.`
