# MASTER SPECIFICATION — OriginOS

**Authority:** This is the master product and technical contract. `CLAUDE.md` sets execution rules. Each `prompts/NN-*.md` adds implementation scope, and phase status is tracked in `docs/BUILD_STATE.md`. If requirements conflict, stop and record an ADR; do not silently reinterpret the vision.

## 1. Product mission and differentiation
OriginOS is a unified, verifiable work and knowledge infrastructure: **know who or what contributed, where content came from, which evidence supports it, what agents observed or did, who authorized actions, and what was ultimately published or changed.** It is not a universal truth machine and cannot prove the absence of AI involvement in text. Build **cross-agent, cross-provider evidence and consequence tracing**, not another generic LLM chat wrapper.

### Core experiences
- **Public network:** creator/discovery profiles, curated articles, published provenance/verification pages and embed widgets; browser-indexable and privacy aware.
- **Private workspace:** creators, teams, researchers, editors and security teams manage content, evidence, agents, approvals, libraries and publishing.
- **Developer platform:** API keys, OAuth, MCP, SDKs, event webhooks, metrics, open components, sandboxed integrations, marketplace contracts.

### Main personas and jobs
1. Independent creator: establish attributable creative track record, publish proof pages, manage AI disclosure and links to original material.
2. Reader: discover high-quality original work and inspect provenance without confusing cryptographic integrity with truth.
3. Publisher/editor: review sources, collaborate, approve, publish to existing channels, demonstrate a documented review trail.
4. Researcher: collect articles, map claims to citations, inspect conflicting evidence and save reproducible findings.
5. Developer/AI engineer: instrument Claude and other agents, investigate tool calls and downstream outcomes, enforce policies on supported actions.
6. Organization admin: manage tenants, staff, permissions, retention, budgets, connected applications and incident response.

## 2. The 15-module map
| Module | Core objects | Main workflows |
|---|---|---|
| AgentTrust | Agent, Run, Span, Action, Policy, Approval, ExecutionReceipt | Observe, investigate, approve/deny supported actions, export receipts |
| PublisherOS | Draft, Submission, Review, Publication, Channel | Plan, review sources, request changes, approve and publish |
| EvidenceGraph | Source, Paper, Claim, EvidenceSpan, Assessment | Ingest, extract, retrieve, cite, contrast, review |
| OriginGraph | Work, Version, Derivation, Attestation, ContentHash | Inspect provenance, origin history, contributions and linked actions |
| IdentityMesh | Subject, IdentityClaim, Credential, Issuer | Verify controllable accounts/domains, issue/revoke scoped credentials |
| CreatorRights | LicenseClaim, Grant, Dispute, ReuseRequest | Declare rights, request permissions, dispute and review |
| Verified Human | CreatorProfile, Collection, DiscoveryItem | Opt-in public profiles, curated discovery, transparent badges |
| Origin Studio | DraftVersion, Note, Citation, Comment | Research writing, attributed edits and editorial handoff |
| Origin Library | LibraryItem, Collection, Import | Save, organize, link, find and share authorized sources |
| Origin Intelligence | SearchQuery, EvidenceAnswer, AISession | Federated search, provenance-linked assistant, investigations |
| Origin Automations | Workflow, Trigger, Step, Execution | Durable supervised automations and approvals |
| Origin Registry | AgentIdentity, Issuer, Publisher, CredentialStatus | Discover and validate permitted registry entries |
| Origin Analytics | UsageMetric, CostEvent, Report | Measured dashboards, tenant billing and reliability metrics |
| Origin Connect | Connection, OAuthGrant, WebhookDelivery, MCPTool | Integrate Claude, Slack, GitHub, WordPress and research feeds |
| Origin Marketplace | ExtensionManifest, Listing, Installation | Reviewed extensibility with explicit scopes and consent |

## 3. Domain and evidence model
Canonical entities: Subject (human / organization / agent), IdentityClaim, Credential, Work, WorkVersion, Asset, ContentHash, ProvenanceAssertion, VerificationResult, Relation (typed edges), Source, SourceVersion, Claim, EvidenceSpan, Assessment, AgentRun, AgentEvent, ToolAction, Approval, Policy, Workflow, Publication, LicenseDeclaration, Tenant, Consent, ProviderConnection, AuditEvent.

Each evidence-like fact stores: immutable identifier, original source/provider, first_seen_at, asserted_by, observed_by (if different), tenant visibility, exact subject/object IDs, related artifact/URL and version, capture method, validation mechanism, confidence limitations, superseded/revoked state, hash/signature if applicable. Typed relations have provenance; inference-generated edges are clearly labeled and reviewable. Avoid a meaningless universal 'trust score.'

### Assurance vocabulary
- **Identity reviewed:** a defined human/automated verification process checked a claim and evidence; state how.
- **Domain/account controlled:** authorization challenge succeeded for a domain/account at a point in time.
- **Signed provenance validated:** supported C2PA (or other specified) signature/content binding validated; signer trust explained.
- **Creator-declared AI use:** not independently proven.
- **Agent action observed:** event captured by specific instrumentation, not a claim about invisible model internals.
- **Outcome confirmed:** external provider confirmed an effect (e.g., GitHub merged PR); distinct from action attempted.
- **Research claim assessed:** analysis with inspectable cited passages and limitations, not automated truth certification.

Never merge these into one '100% human' seal, or conflate work registration with ownership.

## 4. Implementation architecture
**Initial topology:** one modular TypeScript API + Next.js app + workers + services for high-risk file/media processing + MCP server + telemetry ingest. Grow into microservices only with measured need. No blockchain requirement.

```
Public web / Private app / Developer console / Claude MCP / Slack
                      |   CDN/WAF/Auth   |
                     API Gateway + BFF
      +---------------+-----------+------------------+
      | Core & RBAC   | Trust     | Content / Agents |
      | Organizations | Identity  | Evidence/Publish |
      +---------------+-----------+------------------+
                  Outbox / Durable workflows
      +--------------+------------+------------------+
      | PostgreSQL   | S3 Assets  | Search/Telemetry |
      +--------------+------------+------------------+
           External provider adapters / Model gateway
```

- **Web:** Next.js + Tailwind + accessible shared UI. Origin Studio Tiptap. Graphs Cytoscape/React Flow with table fallback.
- **API:** NestJS + Fastify, Zod/OpenAPI validated APIs. Internal modules enforce schema and tenant permissions.
- **Data:** PostgreSQL Drizzle; pgvector/full-text initially; relational edges with typed relation constraints. Telemetry separate storage when justified.
- **Background:** durable jobs, idempotency, retries, cancelation, approval-wait states; outbox for transactional events.
- **Trust:** CAI SDK, secure signer key service; keys never exposed to LLM or browser; standards-aware credential profile and revocation.
- **AI:** cloud API initially, optional self-hosted later. Evaluate models with task-specific tests, tokens/latency/cost and privacy constraints. AI reads scoped evidence; no silent write permissions.
- **Observability:** OTEL spans/logs/metrics with redaction; correlation IDs across HTTP/job/agent action.
- **DevOps:** Docker, CI, IaC, staging/production separation, backups, rollback and secret rotation.

## 5. Identity, access, privacy
Tenant isolation is enforced at database query/service/storage boundaries. RBAC/ABAC scopes include artifact, organization, API, agent and external connection. Default least privilege; deliberate review for irreversible actions. Consent for creator directory, telemetry collection and public provenance. Public shareable data should be separately published from private evidence. Logged agent prompts may contain sensitive code; default to metadata and redaction. User can revoke connections. Retention, erasure, legal hold, and integrity receipt constraints must be documented honestly.

## 6. Integration semantics
- **Claude MCP:** our authorized read/write tools usable within Claude. It does not retrieve private Claude conversation history automatically.
- **Claude Code hook collector:** optional local instrumented subset of lifecycle/tool events as officially supported; show instrumentation coverage gaps.
- **Claude API/Agent SDK:** trace apps that explicitly instrument their requests and tools, plus provider telemetry if supported.
- **Slack:** installable Bolt JS app, slash commands, notifications, explicit approval UI; OriginOS remains source of truth.
- **GitHub:** least-privilege GitHub App and verified webhooks; reconcile proposed action vs merged/deployed results.
- **Publishing:** WordPress first, generic authenticated webhook and RSS; provenance records link to canonical site.
- **Research:** Crossref, OpenAlex, PubMed/arXiv metadata and licensed full-text; no bypassing paywalls or unconsented scraping.
- **Moltbot/OpenClaw / other agent runtimes:** external telemetry/MCP adapters only if permissions/docs allow; optional.

## 7. Workflows to test end to end
1. Creator verifies domain and submits an article; public record shows accurate assurance labels and versioned source link.
2. Article parsed with references; EvidenceGraph stores claims linked to actual sources; contradictions flagged for review.
3. Claude-based research agent reviews; AgentTrust captures observed run, tool event, citation outcome and token usage where available.
4. Editor reviews evidence and approves; Slack alerts and authenticated approval update the same workflow state.
5. PublisherOS publishes to test WordPress; external post ID and canonical URL correlated in OriginGraph.
6. User asks Claude via remote MCP to explain provenance, evidence and agent actions; authorized results refer to saved records.
7. Revoked connection, tampered signed media, unauthorized cross-tenant query, approval expiry, external provider outage and duplicate webhook all fail safely.

## 8. Functional product standards
Every screen has meaningful empty/error/loading/success states; no fake analytics, fabricated citations, static misleading agent events or dead controls. Build accessible responsive navigation, keyboard use, usable public profiles, creator/editor/researcher/developer paths, dashboard and settings. Integrations show NOT CONFIGURED / CONNECTED / DEGRADED / REVOKED truthfully. Documentation includes workflow examples and installation guide. Reuse common IDs and events across modules. If unimplemented, mark NOT BUILT in product matrix and hide or clearly label it in production.

## 9. Quality and release gates
- New features include unit tests and API contract tests; cross-module workflows have integration and E2E tests.
- Negative tests for unauthorized tenant, revoked consent, failed provider, malicious document, prompt injection, replay webhook and fake signatures.
- No external actions without scope and, where policy requires, approval.
- CI typecheck, lint, test, migration checks, security checks and production build.
- Release only with defensible identity/provenance messaging, incident runbook, export/erasure policies, backups/restore test and zero known critical/high release-blocking vulnerabilities.
- Measure performance, storage, model requests, provider usage, retention and recurring operational expenses.

## 10. Monetization and open-core
Open source useful components (validation client, SDK/collectors, public schemas, embeddable widget, selected MCP tools), subject to license review. Hosted company value comes from multi-tenant operations, collaboration, durable retention, secure approvals, integrations, service levels, analytics and support. Never make verification outcomes purchasable. Future commercial tiers: developer/team/publisher/enterprise, gated by measured usage and human feedback.

## 11. Build process and continuity
Start each phase with repository inspection and `docs/BUILD_STATE.md`; read numbered prompt. Ship real code + tests and update state docs with files changed, blockers, commands and pass/fail. The user can run `/origin-build 00`, then `/origin-build 01` onward. **Do not run the whole sequence in one agent turn.** Each phase should be independently reviewable; large phases may require multiple internal iterations and commits.

## 12. Source documentation and version verification
Use the latest official documentation and pin compatibility decisions at implementation time: Claude Code memory/skills/hooks, Anthropic SDK/MCP docs, CAI SDK, Slack Bolt, GitHub Apps, OpenTelemetry, provider OAuth guides, Stripe test mode, current W3C credentials. Do not use a stale spec blindly. Reference official docs in `docs/DECISIONS.md`.
