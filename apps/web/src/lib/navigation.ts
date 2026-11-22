/**
 * Single source of truth for navigation and for what each section will contain.
 * Placement follows docs/ARCHITECTURE.md §7. Every planned feature carries the
 * build phase that delivers it, so unbuilt areas say so instead of looking empty.
 */

export interface PlannedFeature {
  readonly feature: string;
  readonly phase: number;
  readonly description: string;
}

export interface Section {
  readonly id: string;
  readonly href: string;
  readonly label: string;
  /** Product modules that live in this section. */
  readonly modules: readonly string[];
  readonly summary: string;
  readonly planned: readonly PlannedFeature[];
  readonly keywords: readonly string[];
}

export const workspaceSections = [
  {
    id: "home",
    href: "/home",
    label: "Home",
    modules: ["Origin Intelligence", "Origin Analytics"],
    summary: "What changed, what needs your approval, and how the workspace is doing.",
    keywords: ["activity", "approvals", "dashboard", "intelligence", "analytics"],
    planned: [
      {
        feature: "Activity feed",
        phase: 6,
        description: "Audit events from the shared ledger, newest first.",
      },
      {
        feature: "Pending approvals",
        phase: 20,
        description: "Agent actions and policy exceptions waiting for a person.",
      },
      {
        feature: "Ask Origin Intelligence",
        phase: 34,
        description: "Source-linked answers over your workspace. Also on ⌘K.",
      },
      {
        feature: "Workspace analytics summary",
        phase: 37,
        description: "Usage and operational metrics computed from recorded events.",
      },
    ],
  },
  {
    id: "agents",
    href: "/agents",
    label: "Agents",
    modules: ["AgentTrust"],
    summary: "Accountability for AI agents: what ran, under which policy, and what it produced.",
    keywords: [
      "agenttrust",
      "runs",
      "telemetry",
      "flight recorder",
      "policies",
      "receipts",
      "claude",
    ],
    planned: [
      {
        feature: "Agents and telemetry ingest",
        phase: 16,
        description: "Register agents and collect OpenTelemetry from supported runtimes.",
      },
      {
        feature: "Claude Code hooks collector",
        phase: 17,
        description: "Opt-in hooks that report only instrumented sessions.",
      },
      {
        feature: "Flight recorder",
        phase: 19,
        description: "Replay a run's redacted trace and investigate outcomes.",
      },
      {
        feature: "Policies, approvals and signed receipts",
        phase: 20,
        description: "Rules for consequential actions, with human approval and receipts.",
      },
    ],
  },
  {
    id: "research",
    href: "/research",
    label: "Research",
    modules: ["EvidenceGraph", "Origin Library"],
    summary: "Sources, claims and the evidence that links them.",
    keywords: ["evidencegraph", "sources", "claims", "citations", "library", "collections"],
    planned: [
      {
        feature: "Source connectors and ingestion",
        phase: 24,
        description: "Import papers, datasets and web sources with their metadata.",
      },
      {
        feature: "Claims and citation assessments",
        phase: 25,
        description: "Extracted claims linked to sources, with assessment labels.",
      },
      {
        feature: "EvidenceGraph explorer",
        phase: 26,
        description: "Browse how claims, sources and works connect.",
      },
      {
        feature: "Origin Library",
        phase: 27,
        description: "Collections and knowledge workspaces.",
      },
    ],
  },
  {
    id: "publish",
    href: "/publish",
    label: "Publish",
    modules: ["Origin Studio", "PublisherOS"],
    summary: "Write, review and distribute work with its provenance attached.",
    keywords: [
      "studio",
      "editor",
      "drafts",
      "publisheros",
      "submissions",
      "review",
      "distribution",
    ],
    planned: [
      {
        feature: "Origin Studio editor",
        phase: 28,
        description: "Drafts with collaboration and version history.",
      },
      {
        feature: "Editorial workflow",
        phase: 29,
        description: "Submissions, review board and scheduling.",
      },
      {
        feature: "Distribution connectors",
        phase: 30,
        description: "Publish to external channels after you approve.",
      },
    ],
  },
  {
    id: "trust",
    href: "/trust",
    label: "Trust",
    modules: ["IdentityMesh", "OriginGraph", "CreatorRights", "Origin Registry"],
    summary: "Who you are, what you made, and the rights attached to it.",
    keywords: [
      "identity",
      "identitymesh",
      "provenance",
      "origingraph",
      "c2pa",
      "rights",
      "licences",
      "registry",
    ],
    planned: [
      {
        feature: "Creator and organization profiles",
        phase: 9,
        description: "Identity evidence with honest assurance labels.",
      },
      {
        feature: "Portable credentials",
        phase: 10,
        description: "Verifiable credentials on a validated spec profile.",
      },
      {
        feature: "Works and versions",
        phase: 11,
        description: "Content authorship records with exact hashes.",
      },
      {
        feature: "C2PA media validation",
        phase: 12,
        description: "Validates supported provenance claims, not authorship or truth.",
      },
      {
        feature: "Provenance explorer",
        phase: 13,
        description: "The OriginGraph of works, versions and relations.",
      },
      {
        feature: "Licences, requests and disputes",
        phase: 33,
        description: "CreatorRights licensing.",
      },
      {
        feature: "Registry entries",
        phase: 36,
        description: "Your workspace's actors and attestations in Origin Registry.",
      },
    ],
  },
  {
    id: "discover",
    href: "/discover",
    label: "Discover",
    modules: ["Verified Human"],
    summary: "The public creator network, seen from inside your workspace.",
    keywords: ["verified human", "directory", "creators", "topics", "digests", "newsletters"],
    planned: [
      {
        feature: "Verified Human directory",
        phase: 31,
        description: "Creators and collections with their verification records.",
      },
      {
        feature: "Followed topics and digests",
        phase: 32,
        description: "Newsletters and discovery feeds.",
      },
    ],
  },
  {
    id: "integrations",
    href: "/integrations",
    label: "Integrations",
    modules: ["Origin Connect", "Origin Automations", "Origin Marketplace"],
    summary: "Connections to other tools, automated workflows and extensions.",
    keywords: [
      "connect",
      "oauth",
      "webhooks",
      "automations",
      "workflows",
      "marketplace",
      "slack",
      "github",
    ],
    planned: [
      {
        feature: "Connections and webhooks",
        phase: 8,
        description: "Origin Connect OAuth broker and signed webhooks.",
      },
      {
        feature: "GitHub App",
        phase: 21,
        description: "Reconcile agent work with repository outcomes.",
      },
      {
        feature: "OriginOS for Slack",
        phase: 22,
        description: "Approvals and notifications in Slack.",
      },
      {
        feature: "Automations",
        phase: 35,
        description: "Workflow builder with human approval steps.",
      },
      {
        feature: "Marketplace",
        phase: 40,
        description: "Listings, installs and extension contracts.",
      },
    ],
  },
  {
    id: "settings",
    href: "/settings",
    label: "Settings",
    modules: ["Origin Analytics"],
    summary: "Members, consent, retention and billing for this workspace.",
    keywords: ["members", "roles", "consent", "retention", "billing", "usage", "status"],
    planned: [
      { feature: "Members and roles", phase: 4, description: "Sign-in, teams and organizations." },
      {
        feature: "Consent and retention",
        phase: 5,
        description: "Authorization policy baseline and consent records.",
      },
      { feature: "Billing and usage", phase: 39, description: "Metering and commercial accounts." },
    ],
  },
] as const satisfies readonly Section[];

export type WorkspaceSectionId = (typeof workspaceSections)[number]["id"];

export const developerSection: Section = {
  id: "developers",
  href: "/developers",
  label: "Developer console",
  modules: ["Origin Connect", "AgentTrust"],
  summary: "Keys, apps and docs for building on OriginOS.",
  keywords: ["api", "keys", "oauth apps", "mcp", "sdk", "docs", "sandbox", "telemetry"],
  planned: [
    {
      feature: "OAuth apps and webhooks",
      phase: 8,
      description: "Register apps and webhook endpoints.",
    },
    {
      feature: "Telemetry ingest keys and collector install",
      phase: 16,
      description: "Credentials for AgentTrust collectors.",
    },
    {
      feature: "MCP connector setup",
      phase: 23,
      description: "Connect Claude and other MCP clients to your workspace.",
    },
    {
      feature: "REST API keys, SDKs and docs",
      phase: 38,
      description: "Versioned OpenAPI, SDKs, sandbox and usage.",
    },
  ],
};

export const publicNav = [
  { href: "/home", label: "Workspace" },
  { href: "/developers", label: "Developers" },
] as const;

export const publicPlanned: readonly PlannedFeature[] = [
  {
    feature: "Public verification records",
    phase: 14,
    description: "Shareable pages and embeddable widgets for a work's provenance.",
  },
  {
    feature: "Verified Human directory",
    phase: 31,
    description: "Creator profiles with their identity evidence and works.",
  },
  { feature: "Public Registry lookup", phase: 36, description: "Look up actors and attestations." },
];

export function getSection(id: WorkspaceSectionId): Section {
  const section = workspaceSections.find((s) => s.id === id);
  if (!section) throw new Error(`Unknown section ${id}`);
  return section;
}

/** Entries for the ⌘K command bar, derived from the same config as the sidebar. */
export function commandItems(): {
  id: string;
  label: string;
  href: string;
  group: string;
  keywords: readonly string[];
}[] {
  return [
    ...workspaceSections.map((s) => ({
      id: s.id,
      label: s.label,
      href: s.href,
      group: "Workspace",
      keywords: [...s.keywords, ...s.modules],
    })),
    {
      id: developerSection.id,
      label: developerSection.label,
      href: developerSection.href,
      group: "Developers",
      keywords: developerSection.keywords,
    },
    {
      id: "public",
      label: "Public network",
      href: "/",
      group: "Public",
      keywords: ["landing", "public", "verification"],
    },
  ];
}

/** Every route the shell links to; the E2E suite visits each one. */
export function allNavRoutes(): string[] {
  return ["/", ...workspaceSections.map((s) => s.href), developerSection.href];
}
