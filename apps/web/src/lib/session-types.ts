/** Shapes shared by server and client code. No secrets: ids, names, emails and roles only. */
export interface Membership {
  readonly organizationId: string;
  readonly name: string;
  readonly slug: string;
  readonly role: "owner" | "admin" | "member";
}

export interface Me {
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly emailVerified: boolean;
    readonly twoFactorEnabled: boolean;
  };
  readonly activeOrganizationId: string | null;
  readonly memberships: readonly Membership[];
}

export interface WorkspaceSession {
  readonly me: Me;
  readonly active: Membership;
}
