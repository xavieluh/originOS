import { evaluate } from "./evaluate.js";
import {
  RESOURCE_TYPES,
  type Action,
  type GrantEffect,
  type GrantResourceType,
  type HumanActor,
} from "./model.js";

export interface ProposedGrant {
  readonly effect: GrantEffect;
  readonly resourceType: GrantResourceType;
  readonly resourceId: string | null;
  readonly actions: readonly Action[];
  readonly subject: {
    readonly type: "human" | "agent" | "service";
    readonly id: string;
    /** True when the subject is the organization's owner. */
    readonly isOrganizationOwner: boolean;
  };
}

export type GrantRefusal =
  | "grantor_cannot_manage_grants"
  | "grant_exceeds_grantor"
  | "ownership_is_role_only"
  | "cannot_deny_owner"
  | "cannot_grant_self"
  | "empty_grant";

/**
 * Whether `grantor` may create this grant. Rules that stop privilege escalation:
 *  - only people with admin on "grants" may create or revoke grants;
 *  - an allow grant can only hand on actions the grantor holds on every
 *    resource type it covers (no granting what you don't have);
 *  - "admin" on the organization (ownership) is never grantable;
 *  - nobody can deny the owner (that would lock the organization);
 *  - nobody grants themselves anything (another administrator must).
 */
export function checkGrant(
  grantor: HumanActor,
  grant: ProposedGrant,
  now: Date = new Date(),
): GrantRefusal | null {
  if (grant.actions.length === 0) return "empty_grant";
  if (!evaluate(grantor, "admin", { type: "grants" }, now).allowed)
    return "grantor_cannot_manage_grants";
  if (grant.subject.type === "human" && grant.subject.id === grantor.id) return "cannot_grant_self";
  const types = grant.resourceType === "*" ? RESOURCE_TYPES : [grant.resourceType];
  if (grant.effect === "deny") {
    return grant.subject.isOrganizationOwner ? "cannot_deny_owner" : null;
  }
  if (types.includes("organization") && grant.actions.includes("admin"))
    return "ownership_is_role_only";
  for (const type of types) {
    for (const action of grant.actions) {
      const resource = grant.resourceId === null ? { type } : { type, id: grant.resourceId };
      if (!evaluate(grantor, action, resource, now).allowed) return "grant_exceeds_grantor";
    }
  }
  return null;
}
