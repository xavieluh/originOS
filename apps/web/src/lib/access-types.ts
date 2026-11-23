/** Shapes of the Phase 05 permission and consent endpoints (apps/api core/authz). */

export const ACTIONS = ["read", "write", "publish", "export", "admin"] as const;
export type Action = (typeof ACTIONS)[number];

export const RESOURCE_TYPES = [
  "organization",
  "members",
  "invitations",
  "audit_log",
  "grants",
  "agents",
  "consents",
  "files",
  "jobs",
  "integrations",
  "identity",
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export type PermissionMatrix = Record<ResourceType, Action[]>;

export const RESOURCE_LABELS: Record<ResourceType | "*", string> = {
  organization: "Organization",
  members: "Members",
  invitations: "Invitations",
  audit_log: "Audit log",
  grants: "Permissions",
  agents: "Agents",
  consents: "Consent policies",
  files: "Files",
  jobs: "Background jobs",
  integrations: "Integrations",
  identity: "Profiles and identity reviews",
  "*": "Everything",
};

/** Whether the matrix the API computed allows `action` on `type`. Display only: the API decides. */
export const can = (m: PermissionMatrix | null, action: Action, type: ResourceType) =>
  m?.[type]?.includes(action) ?? false;

export interface GrantRow {
  readonly id: string;
  readonly subjectType: "user" | "agent" | "service";
  readonly subjectId: string;
  readonly subjectName: string | null;
  readonly effect: "allow" | "deny";
  readonly resourceType: ResourceType | "*";
  readonly resourceId: string | null;
  readonly actions: Action[];
  readonly reason: string | null;
  readonly status: "active" | "revoked" | "expired";
  readonly expiresAt: string | null;
  readonly createdByName: string | null;
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

export interface MyPermissions {
  readonly role: "owner" | "admin" | "member";
  readonly permissions: PermissionMatrix;
  readonly grants: readonly GrantRow[];
}

export interface AgentRow {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly ownerUserId: string;
  readonly ownerName: string;
  readonly status: "active" | "disabled";
  readonly createdAt: string;
  readonly disabledAt: string | null;
  readonly canManage: boolean;
}

export interface AgentPermissions {
  readonly agent: { id: string; name: string; status: "active" | "disabled"; ownerUserId: string };
  readonly permissions: PermissionMatrix;
  readonly ownerPermissions: PermissionMatrix;
  readonly grants: readonly GrantRow[];
}

export type ConsentPurpose =
  | "identity_directory"
  | "telemetry_collection"
  | "data_sharing"
  | "provider_scopes"
  | "cross_org_policy";

export interface ConsentPurposeInfo {
  readonly purpose: ConsentPurpose;
  readonly title: string;
  readonly description: string;
  readonly scopeKeyLabel: string | null;
}

export interface ConsentRecord {
  readonly id: string;
  readonly purpose: ConsentPurpose;
  readonly scopeKey: string;
  readonly policyVersion: string;
  readonly status: "active" | "revoked";
  readonly grantedAt: string;
  readonly revokedAt: string | null;
}

export interface ConsentList {
  readonly policyVersion: string;
  readonly purposes: readonly ConsentPurposeInfo[];
  readonly records: readonly ConsentRecord[];
}
