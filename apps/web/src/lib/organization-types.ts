export type Role = "owner" | "admin" | "member";

export interface OrganizationDetail {
  readonly organization: { id: string; name: string; slug: string; createdAt: string };
  readonly myRole: Role;
  readonly members: readonly {
    userId: string;
    name: string;
    email: string;
    role: Role;
    joinedAt: string;
  }[];
}

export interface InvitationRow {
  readonly id: string;
  readonly email: string;
  readonly role: "admin" | "member";
  readonly status: "pending" | "accepted" | "revoked" | "expired";
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface AuditEventRow {
  readonly id: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly actorUserId: string | null;
  readonly actorName: string | null;
  readonly metadata: Record<string, string | number | boolean | null>;
  readonly occurredAt: string;
}

/** Plain-language audit labels; unknown actions fall back to their machine name. */
export function describeAuditAction(action: string): string {
  return (
    {
      "organization.created": "Created the organization",
      "organization.renamed": "Renamed the organization",
      "invitation.created": "Sent an invitation",
      "invitation.revoked": "Revoked an invitation",
      "member.joined": "Joined",
      "member.role_changed": "Changed a member's role",
      "member.removed": "Removed a member",
      "member.left": "Left the organization",
      "ownership.transferred": "Transferred ownership",
    }[action] ?? action
  );
}
