# Acceptance and validation matrix

**IMPORTANT:** acceptance checks below are specifications, not completed tests.

| Phase | Required checks | Result | Evidence |
|---|---|---|---|
| 00 | docs/ARCHITECTURE.md and docs/DECISIONS.md describe concrete service boundaries / docs/PRODUCT_MAP.md accounts for all 15 modules / docs/ACCEPTANCE_MATRIX.md maps each capability t | NOT RUN | — |
| 01 | clean install works with documented commands / typecheck lint unit tests run / web and api start locally and health endpoints respond / code compiles without fake integrations | NOT RUN | — |
| 02 | fresh checkout bootstraps from README / CI validates a real build / secrets are excluded from git and logs / a developer can start web api database and worker locally | NOT RUN | — |
| 03 | responsive polished shell renders at mobile/tablet/desktop / all navigation routes resolve and unfinished modules clearly say not yet available / accessible keyboard focus and cont | NOT RUN | — |
| 04 | cross-org account access is impossible in tests / invitation expiry and revocation work / user can create an organization and switch authorized workspaces / logged-out requests can | NOT RUN | — |
| 05 | role change triggers audit record / backend rejects forbidden reads and writes even if UI bypassed / agent permissions are narrower than owning user by default / consent can be ins | NOT RUN | — |
| 06 | all migrations apply and rollback safely in test env / an outbox event survives simulated worker outage and is processed once logically under retries / foreign keys and uniqueness  | NOT RUN | — |
| 07 | unauthorized tenant cannot retrieve an object / failed job retries safely without duplicate publishing / upload errors are visible / malicious/oversize file is quarantined or rejec | NOT RUN | — |
| 08 | OAuth state/replay tests pass / provider token never reaches client or log / disconnected providers stop new API calls / webhook signatures and retries verified | NOT RUN | — |
| 09 | verified domain requires successful challenge, not self-report / reviewer actions recorded / revoked or stale proofs are clearly labeled / pseudonymous profiles work without exposi | NOT RUN | — |
| 10 | tampered credential fails validation / revoked credential is marked revoked / test verifier checks issuer and validity rules / unsupported credential formats show explicit unsuppor | NOT RUN | — |
| 11 | upload -> version -> contributor graph is persistent / hash changes when bytes change / duplicate canonical URL cannot silently overwrite another creator / unauthorized re-hosted t | NOT RUN | — |
| 12 | valid fixture passes and modified media fails or reports breakage per SDK / unsigned is unverified not fraudulent / validation returns machine readable diagnostics / never display  | NOT RUN | — |
| 13 | graph roundtrip works on multiple interconnected works / cycle handling and tenant visibility boundaries tested / evidence panel explains each edge provenance / performance safe bo | NOT RUN | — |
| 14 | public anonymous users see only explicitly public data / changed content yields clear invalid/stale status / embed works in a separate-origin test page / claims never overstate hum | NOT RUN | — |
| 15 | model calls use shared gateway and can swap provider in tests / API unavailable yields recoverable queued state / cost and tokens logged where exposed / sources never invented by g | NOT RUN | — |
| 16 | replayed events do not duplicate logical actions / tenant isolation holds on ingestion / trace shows source and observability gaps / sensitive values redacted in logs and UI | NOT RUN | — |
| 17 | real hook smoke test produces at least one observed event / user can disable collection / collector cannot exfiltrate secrets by default / dashboard identifies the originating inst | NOT RUN | — |
| 18 | instrumented sample run appears with linked tool events / absence of instrumentation is displayed as unknown / custom test agent emits valid events / model credentials remain serve | NOT RUN | — |
| 19 | timeline displays real persistent events not hardcoded activity / denied or failed actions visibly differ from confirmed effects / authorized users can export scoped records / sear | NOT RUN | — |
| 20 | disallowed action held before execution in controlled path / approval expiration and replay attacks rejected / no claim of universal enforcement over disconnected agents / receipt  | NOT RUN | — |
| 21 | webhook signature tested and duplicates safe / PR merge state is sourced from GitHub not agent narration / revoked installation stops sync / audit events link to repo metadata with | NOT RUN | — |
| 22 | Slack command accesses only authorized workspace / approving from Slack revalidates server-side permission and state / retry does not cause double publish / integration can be disa | NOT RUN | — |
| 23 | unauthenticated MCP requests rejected / cross-tenant tool call blocked / tools return source-linked structured results / human approvals cannot be bypassed via MCP | NOT RUN | — |
| 24 | same DOI imported twice resolves one canonical source / unavailable full text is not hallucinated / retrieved passages link to version and page where present / ingestion retry and  | NOT RUN | — |
| 25 | every assessment links inspectable evidence or explicitly insufficient data / no fabricated citations / conflicting source test produces a disagreement state / human correction doe | NOT RUN | — |
| 26 | clicking a claim opens exact source span / graph filters and exports work on real DB data / source permission boundaries hold / exported citations include identifiers | NOT RUN | — |
| 27 | user can organize retrieve and share permitted source records / private source never appears via another tenant search / edits generate versioning/audit event / upload and indexing | NOT RUN | — |
| 28 | draft survives reload and concurrent update conflict / citations maintain stable source references / AI-assisted segments have clear disclosure state / editor exports valid content | NOT RUN | — |
| 29 | author cannot self-approve in policy-restricted organization / reviewer can request changes / scheduled item publishes only after required approvals / cancellations are recorded | NOT RUN | — |
| 30 | WordPress sandbox integration demonstrates actual post and verified ID / provider failures do not create duplicate posts / OriginGraph relates final external page to approved versi | NOT RUN | — |
| 31 | public profile displays only consented fields / unsigned work cannot appear cryptographically verified / directory search and source links work / removal request and appeal flow re | NOT RUN | — |
| 32 | double opt-in/unsubscribe enforced as applicable / digest sends only to opted-in subscribers and respects throttling / referral tracking avoids leaking private data / metrics disti | NOT RUN | — |
| 33 | licensed work displays correct user-declared terms and history / dispute state is visible and auditable / unverified ownership is not shown as proven / rights reviewers cannot sile | NOT RUN | — |
| 34 | questions about agent history return evidence-linked runs / search excludes unauthorized items at retrieval time / unsupported claim results clearly indicate no evidence / tool pro | NOT RUN | — |
| 35 | workflow resumes after simulated worker crash / duplicate trigger cannot double-execute non-idempotent action / invalid graphs rejected / approval node actually pauses and resumes  | NOT RUN | — |
| 36 | revoked issuer clearly changes verification result / workspace-private agent not indexed publicly / rotation preserves historical receipt verifiability where possible / public API  | NOT RUN | — |
| 37 | dashboard totals reconcile with test events / time filters and export work / another workspace data is invisible / demo analytics use labeled fixture data | NOT RUN | — |
| 38 | OpenAPI contract tests run against server / API key cannot escalate scopes / sample SDK can verify content and retrieve run in local stack / docs examples use actual endpoints | NOT RUN | — |
| 39 | Stripe test-mode checkout and webhook work / retry cannot double-credit usage / plan limits enforced server-side / disabled billing displays setup requirement instead of fake worki | NOT RUN | — |
| 40 | extension install records scopes and admin consent / unapproved extension not installable / uninstall revokes configured access / initial listings are real internally implemented i | NOT RUN | — |
| 41 | support staff cannot view private data without scoped authorization / export and erasure request tracked / retention purge tested / moderation decisions require reason and produce  | NOT RUN | — |
| 42 | all critical and high severity issues remediated or block release / no cross-tenant read in automated tests / signing keys never embedded in code / threat model updated with real m | NOT RUN | — |
| 43 | publish p50/p95 latency under documented test load not invented claims / duplicate/retry invariants hold / graceful degradation tested / measurable resource cost recorded | NOT RUN | — |
| 44 | staging deploy is demonstrated with output evidence if credentials exist, otherwise blocked accurately with manual steps / restore from backup tested locally/staging / no productio | NOT RUN | — |
| 45 | automated integration suite passes locally with mock/sandbox provider only where clearly labeled / all artifacts linked by identifiers / failed approvals block publication / MCP re | NOT RUN | — |
| 46 | license scope is explicit per component / clean external contributor can run local dev from docs / no false endorsements or standards-compliance claims / vulnerability reporting pa | NOT RUN | — |
| 47 | release checklist links test evidence / no critical/high blockers ignored / first deployment and pilot results clearly labeled actual vs proposed / docs/BUILD_STATE.md lists exact  | NOT RUN | — |

