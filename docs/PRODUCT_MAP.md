# OriginOS product map

**Status:** v1.0, accepted by owner 2026-11-22 (Phase 00). **Every module below is NOT BUILT.** Placement and MVP slices tagged **[GUESS]** are Phase 00 proposals.
Canonical object names follow ADR-002; module-specific aliases are shown in parentheses.

## Release surfaces

1. **Public network** — discovery, creator profiles, verification records, embeds, RSS, public Registry lookup. Anonymous, cacheable, shows only *published copies* of consented fields.
2. **Private workspace** — research, writing, editorial, trust, agent governance. Tenant-scoped.
3. **Developer platform** — API keys, OAuth apps, MCP, SDKs, telemetry ingest keys, webhooks, sandbox, marketplace submissions.
(+ staff **admin console**, Phase 41, not a product surface.)

## Shared platform (not a module, used by all 15)

| Capability | Phases | Context |
|---|---|---|
| Monorepo, CI, dev environment | 01, 02 | — |
| Design system and app shell | 03 | web |
| Auth, orgs, memberships | 04 | Core |
| Authorization, consent, audit | 05 | Core |
| Canonical schema, Relation table, outbox | 06 | Core |
| Object storage, ingestion, jobs | 07 | Core |
| Signing and key registry | 10, 14, 20, 36 (ADR-006) | Trust |
| C2PA validation | 12 | Trust (media validator) |
| AI gateway | 15 | Platform |
| Developer API and SDKs | 38 | Platform |
| Billing and metering | 39 | Platform |
| Admin, privacy, trust ops | 41 | Core |
| Security, performance, deployment | 42, 43, 44 | — |
| Flagship workflow, OSS, release | 45, 46, 47 | — |

## Module overview

| # | Module | One-line purpose | Canonical objects | API context | Nav (workspace) | Public surface | Build phases | Hard dependencies | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **AgentTrust** | Observe instrumented agents, investigate runs, gate routed actions, issue receipts | Subject(agent), AgentRun (Run), AgentEvent (Span), ToolAction (Action), Policy, Approval, Receipt (ExecutionReceipt) | Agents | Agents | — | 16, 17, 18, 19, 20 (+21) | 05, 06, 08, 15, ADR-006 | NOT BUILT |
| 2 | **PublisherOS** | Editorial review, approval and publishing to existing channels | Work/WorkVersion (Draft), Submission, Review, Approval, Publication, ProviderConnection (Channel) | Content | Publish | Canonical link on published pages | 29, 30 | 11, 20, 28, 08 | NOT BUILT |
| 3 | **EvidenceGraph** | Map claims to exact cited passages and show disagreement | Source (Paper), SourceVersion, EvidenceSpan, Claim, Assessment, Relation(CITES, SUPPORTS, CONTRADICTS) | Evidence | Research | — | 24, 25, 26 | 07, 15, 06 | NOT BUILT |
| 4 | **OriginGraph** | Provenance history of works: versions, contributors, derivations, linked agent actions and publications | Work, WorkVersion (Version), Asset, ContentHash, ProvenanceAssertion (Attestation), Relation (Derivation) | Trust + Graph | Trust | Work pages, verification records | 11, 13 (+12, 14) | 06, 07, 12 | NOT BUILT |
| 5 | **IdentityMesh** | Verify control of domains/accounts, issue and revoke scoped credentials | Subject, IdentityClaim, Credential, Subject(issuer) (Issuer) | Trust | Trust | Profile badges with "how" and "as of" | 09, 10 | 04, 05, ADR-006 | NOT BUILT |
| 6 | **CreatorRights** | Declare licences, handle reuse requests and disputes as evidence-backed claims | LicenseDeclaration (LicenseClaim), Grant, ReuseRequest, Dispute | Content | Trust | Licence terms on work pages | 33 | 11, 41 | NOT BUILT |
| 7 | **Verified Human** | Opt-in public creator directory and curated discovery with transparent labels | Subject profile (CreatorProfile), Collection, DiscoveryItem, Consent | Content | Discover | Directory, profiles, collections, digests | 31, 32 (+14) | 09, 11, 14 | NOT BUILT |
| 8 | **Origin Studio** | Research writing with citations, comments, attributed edits and AI-use disclosure | WorkVersion (DraftVersion), Note, Citation (Relation CITES → EvidenceSpan), Comment | Content | Publish | — | 28 | 11, 26, 15 | NOT BUILT |
| 9 | **Origin Library** | Save, organize, search and share authorized sources and works | Collection, membership of Source/Work (LibraryItem), Import | Content | Research | — | 27 | 07, 24 | NOT BUILT |
| 10 | **Origin Intelligence** | Federated permitted search and an evidence-linked workspace investigator | SearchQuery, EvidenceAnswer, AISession | Platform | Home + ⌘K | — | 34 | 15, all indexed modules | NOT BUILT |
| 11 | **Origin Automations** | Durable, supervised workflows on trusted events with approval nodes | Workflow, Trigger, Step, Execution | Platform | Integrations **[GUESS]** | — | 35 (+07) | 07, 20, ADR-003 | NOT BUILT |
| 12 | **Origin Registry** | Lookup of agents, issuers, publishers, keys and credential status | Subject (AgentIdentity, Issuer, Publisher), key registry, CredentialStatus | Trust | Trust | Public privacy-filtered lookup | 36 | 10, 20, ADR-006 | NOT BUILT |
| 13 | **Origin Analytics** | Measured usage, cost, reliability and conversion dashboards | UsageMetric, CostEvent, Report | Platform | Home summary + Settings | — | 37 (+39) | 16, 15, 39 | NOT BUILT |
| 14 | **Origin Connect** | Integration broker: OAuth, tokens, webhooks, connectors (Claude MCP, Slack, GitHub, WordPress, research feeds) | ProviderConnection (Connection, OAuthGrant), WebhookDelivery, MCPTool | Connect | Integrations | — | 08, 21, 22, 23 (+24, 30) | 04, 05 | NOT BUILT |
| 15 | **Origin Marketplace** | Reviewed extensions with explicit scopes and admin consent | ExtensionManifest, Listing, Installation | Connect + Platform | Integrations | Listing pages **[GUESS]** | 40 | 08, 05 | NOT BUILT |

## Module notes

Each note gives the **smallest real vertical slice** that would count as "built" for that module **[GUESS]**, plus where its honesty constraints bite.

1. **AgentTrust.** Slice: one Claude Code hook installation sends events → a run appears in the flight recorder with coverage gaps → a routed GitHub write is held for approval → approved → receipt issued. Honesty: "observed" vs "enforced" vs "outcome confirmed" are visually distinct; no claim over un-routed agents.
2. **PublisherOS.** Slice: submission → reviewer requests changes → approval (author cannot self-approve where policy says so) → WordPress sandbox post with verified post ID. Honesty: external publish only after explicit approval.
3. **EvidenceGraph.** Slice: import a DOI → licensed full text parsed into spans → claim in a draft linked to a span with an assessment of *supported / contradicted / insufficient / uncertain*. Honesty: no fabricated citations; "full text unavailable" stated.
4. **OriginGraph.** Slice: upload → version → hash → contributor edge → explorer with an evidence panel per edge. Honesty: asserted edges vs validated edges styled differently.
5. **IdentityMesh.** Slice: DNS/HTML domain challenge and GitHub OAuth proof → labels with date → expiry/revocation. Honesty: pseudonymous profiles supported; a signature is not a government identity.
6. **CreatorRights.** Slice: declare licence → reuse request → dispute with evidence and staff decision. Honesty: ownership is never shown as proven.
7. **Verified Human.** Slice: opt-in profile with only consented fields → directory search → removal/appeal. Honesty: four relevant labels from the seven-label vocabulary, never a seal.
8. **Origin Studio.** Slice: Tiptap draft with autosave, stable citations, version history, AI-assisted segment disclosure, Markdown/HTML export.
9. **Origin Library.** Slice: collections + import + keyword search with tenant-scoped retrieval; semantic search after AI gateway exists.
10. **Origin Intelligence.** Slice: question about agent history returns linked runs; "no evidence" when there is none; injection fixture does not trigger actions.
11. **Origin Automations.** Slice: one template (new article review) with approval node that pauses and resumes across worker restart.
12. **Origin Registry.** Slice: key and issuer status lookup; revoked issuer flips verification result; private agents not publicly indexed.
13. **Origin Analytics.** Slice: dashboard totals reconcile with test events; estimated vs observed metrics labelled; demo data labelled as fixture.
14. **Origin Connect.** Slice: connect/disconnect one provider with scope disclosure; truthful status; webhook signature + replay tests.
15. **Origin Marketplace.** Slice: internal curated listings only (real built integrations), install records scopes + admin consent, uninstall revokes access.

## Cross-module objects (canonical)

Subject, IdentityClaim, Credential, Work, WorkVersion, Asset, ContentHash, ProvenanceAssertion, VerificationResult, Relation, Source, SourceVersion, Claim, EvidenceSpan, Assessment, AgentRun, AgentEvent, ToolAction, Approval, Policy, Receipt, Workflow, Publication, LicenseDeclaration, Tenant, Consent, ProviderConnection, AuditEvent.

## Principle

Build shared capabilities once, expose them to multiple product surfaces, and distinguish verified evidence from assertions.
