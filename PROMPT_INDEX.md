# OriginOS Prompt Index — 48 implementation phases

Use **one phase per Claude Code invocation**. `CLAUDE.md` + `docs/MASTER_SPEC.md` remain in the repo for continuity. You can type `/origin-build NN` to load the corresponding file. Do not paste all 48 prompts simultaneously.

| Phase | Workstream | Build prompt | Trigger |
|---:|---|---|---|
| 00 | Foundation | [Product contract and architecture](prompts/00-product-contract-and-architecture.md) | `/origin-build 00` |
| 01 | Foundation | [Production-shaped monorepo](prompts/01-production-shaped-monorepo.md) | `/origin-build 01` |
| 02 | Foundation | [Local development, CI and conventions](prompts/02-local-development-ci-and-conventions.md) | `/origin-build 02` |
| 03 | Foundation | [Distinctive UX system and app shell](prompts/03-distinctive-ux-system-and-app-shell.md) | `/origin-build 03` |
| 04 | Core | [Authentication, teams and organizations](prompts/04-authentication-teams-and-organizations.md) | `/origin-build 04` |
| 05 | Core | [Authorization, policy baseline and consent](prompts/05-authorization-policy-baseline-and-consent.md) | `/origin-build 05` |
| 06 | Core | [Core domain schema, ledger and outbox](prompts/06-core-domain-schema-ledger-and-outbox.md) | `/origin-build 06` |
| 07 | Core | [Object storage, ingestion queues and workflow core](prompts/07-object-storage-ingestion-queues-and-workflow-core.md) | `/origin-build 07` |
| 08 | Core | [Origin Connect OAuth and integration broker](prompts/08-origin-connect-oauth-and-integration-broker.md) | `/origin-build 08` |
| 09 | Trust | [IdentityMesh creator and organization profiles](prompts/09-identitymesh-creator-and-organization-profiles.md) | `/origin-build 09` |
| 10 | Trust | [IdentityMesh portable credentials](prompts/10-identitymesh-portable-credentials.md) | `/origin-build 10` |
| 11 | Trust | [Content, authorship and versions](prompts/11-content-authorship-and-versions.md) | `/origin-build 11` |
| 12 | Trust | [C2PA media validation service](prompts/12-c2pa-media-validation-service.md) | `/origin-build 12` |
| 13 | Trust | [OriginGraph provenance graph and explorer](prompts/13-origingraph-provenance-graph-and-explorer.md) | `/origin-build 13` |
| 14 | Trust | [Public verification pages and embeddable widgets](prompts/14-public-verification-pages-and-embeddable-widgets.md) | `/origin-build 14` |
| 15 | AI | [Provider-agnostic AI gateway and safety budgets](prompts/15-provider-agnostic-ai-gateway-and-safety-budgets.md) | `/origin-build 15` |
| 16 | Agents | [AgentTrust telemetry collector](prompts/16-agenttrust-telemetry-collector.md) | `/origin-build 16` |
| 17 | Agents | [Claude Code hooks and CLI collector](prompts/17-claude-code-hooks-and-cli-collector.md) | `/origin-build 17` |
| 18 | Agents | [Claude API and external agent SDK instrumentation](prompts/18-claude-api-and-external-agent-sdk-instrumentation.md) | `/origin-build 18` |
| 19 | Agents | [AgentTrust flight recorder and investigations](prompts/19-agenttrust-flight-recorder-and-investigations.md) | `/origin-build 19` |
| 20 | Agents | [AgentTrust policy, approvals and signed receipts](prompts/20-agenttrust-policy-approvals-and-signed-receipts.md) | `/origin-build 20` |
| 21 | Integrations | [GitHub App and outcome reconciliation](prompts/21-github-app-and-outcome-reconciliation.md) | `/origin-build 21` |
| 22 | Integrations | [OriginOS for Slack](prompts/22-originos-for-slack.md) | `/origin-build 22` |
| 23 | Integrations | [Claude MCP connector and developer agent tools](prompts/23-claude-mcp-connector-and-developer-agent-tools.md) | `/origin-build 23` |
| 24 | Research | [Research source connectors and ingestion](prompts/24-research-source-connectors-and-ingestion.md) | `/origin-build 24` |
| 25 | Research | [Claim extraction and citation assessments](prompts/25-claim-extraction-and-citation-assessments.md) | `/origin-build 25` |
| 26 | Research | [EvidenceGraph explorer](prompts/26-evidencegraph-explorer.md) | `/origin-build 26` |
| 27 | Creation | [Origin Library and knowledge workspaces](prompts/27-origin-library-and-knowledge-workspaces.md) | `/origin-build 27` |
| 28 | Creation | [Origin Studio editor and collaboration](prompts/28-origin-studio-editor-and-collaboration.md) | `/origin-build 28` |
| 29 | Publishing | [PublisherOS editorial workflow](prompts/29-publisheros-editorial-workflow.md) | `/origin-build 29` |
| 30 | Publishing | [PublisherOS external distribution connectors](prompts/30-publisheros-external-distribution-connectors.md) | `/origin-build 30` |
| 31 | Community | [Verified Human public creator network](prompts/31-verified-human-public-creator-network.md) | `/origin-build 31` |
| 32 | Community | [Community distribution, newsletters and discovery](prompts/32-community-distribution-newsletters-and-discovery.md) | `/origin-build 32` |
| 33 | Rights | [CreatorRights licensing and disputes](prompts/33-creatorrights-licensing-and-disputes.md) | `/origin-build 33` |
| 34 | AI | [Origin Intelligence search and investigator](prompts/34-origin-intelligence-search-and-investigator.md) | `/origin-build 34` |
| 35 | Automation | [Origin Automations workflow builder](prompts/35-origin-automations-workflow-builder.md) | `/origin-build 35` |
| 36 | Registry | [Origin Registry of actors and attestations](prompts/36-origin-registry-of-actors-and-attestations.md) | `/origin-build 36` |
| 37 | Operations | [Origin Analytics and operational dashboards](prompts/37-origin-analytics-and-operational-dashboards.md) | `/origin-build 37` |
| 38 | Developer | [Developer REST API, SDKs and docs portal](prompts/38-developer-rest-api-sdks-and-docs-portal.md) | `/origin-build 38` |
| 39 | Commercial | [Billing, metering and commercial accounts](prompts/39-billing-metering-and-commercial-accounts.md) | `/origin-build 39` |
| 40 | Developer | [Origin Marketplace and extension contracts](prompts/40-origin-marketplace-and-extension-contracts.md) | `/origin-build 40` |
| 41 | Operations | [Administration, privacy and trust operations](prompts/41-administration-privacy-and-trust-operations.md) | `/origin-build 41` |
| 42 | Quality | [Security hardening and independent verification preparation](prompts/42-security-hardening-and-independent-verification-preparation.md) | `/origin-build 42` |
| 43 | Quality | [Performance, reliability and failure recovery](prompts/43-performance-reliability-and-failure-recovery.md) | `/origin-build 43` |
| 44 | Infrastructure | [Deployment, domains and disaster recovery](prompts/44-deployment-domains-and-disaster-recovery.md) | `/origin-build 44` |
| 45 | Integration | [Integrated OriginOS flagship workflow](prompts/45-integrated-originos-flagship-workflow.md) | `/origin-build 45` |
| 46 | Launch | [Open-source governance, developer community and docs](prompts/46-open-source-governance-developer-community-and-docs.md) | `/origin-build 46` |
| 47 | Launch | [Release audit and first real customer pilot](prompts/47-release-audit-and-first-real-customer-pilot.md) | `/origin-build 47` |

## Cross-cutting command

Use `/origin-audit 17` (for example) after a phase to independently review actual implementation. It is an audit, not a replacement for writing tests.

## Delivery strategy

Foundation 00–08 → Trust 09–14 → AI/Agents 15–20 → Integration 21–23 → Research 24–26 → Creation/Publishing 27–30 → Community/Rights 31–33 → Intelligence/Automation/Registry/Analytics 34–37 → Developer/Commercial 38–40 → Privacy/Security/Operations 41–45 → Open-source and Release 46–47.

> Note: This is an expansive **full-platform roadmap** and not a promise of quick one-shot completion. Different phases may take multiple development sessions and real credential configuration.
