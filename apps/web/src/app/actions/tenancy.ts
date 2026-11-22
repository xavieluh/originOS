"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "../../lib/api";

/** What every action returns to the browser: success, or an error a person can read. Never raw API bodies. */
export type ActionResult<T = null> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string; readonly message: string };

async function call<T>(path: string, method: string, body?: unknown): Promise<ActionResult<T>> {
  const result = await apiFetch<T>(path, { method, ...(body !== undefined ? { body } : {}) });
  if (!result.ok) return { ok: false, error: result.error, message: result.message };
  revalidatePath("/", "layout");
  return { ok: true, data: result.data };
}

export async function createOrganizationAction(name: string) {
  return call<{ organizationId: string; name: string }>("/v1/organizations", "POST", { name });
}

export async function switchOrganizationAction(organizationId: string) {
  return call("/v1/me/active-organization", "PUT", { organizationId });
}

export async function renameOrganizationAction(name: string) {
  return call("/v1/organization", "PATCH", { name });
}

export async function inviteMemberAction(email: string, role: "admin" | "member") {
  return call<{ id: string; email: string }>("/v1/organization/invitations", "POST", {
    email,
    role,
  });
}

export async function revokeInvitationAction(invitationId: string) {
  return call(
    `/v1/organization/invitations/${encodeURIComponent(invitationId)}/revoke`,
    "POST",
    {},
  );
}

export async function changeRoleAction(userId: string, role: "admin" | "member") {
  return call(`/v1/organization/members/${encodeURIComponent(userId)}`, "PATCH", { role });
}

export async function removeMemberAction(userId: string) {
  return call(`/v1/organization/members/${encodeURIComponent(userId)}`, "DELETE");
}

export async function transferOwnershipAction(userId: string) {
  return call("/v1/organization/transfer-ownership", "POST", { userId });
}

export interface InvitationPreview {
  readonly organizationName: string | null;
  readonly role: "admin" | "member";
  readonly email: string;
  readonly status: "pending" | "accepted" | "revoked" | "expired";
  readonly expiresAt: string;
  readonly emailMatches: boolean;
}

/** Tokens go in POST bodies only, so they never appear in URLs or access logs. */
export async function lookupInvitationAction(token: string) {
  const result = await apiFetch<InvitationPreview>("/v1/invitations/lookup", {
    method: "POST",
    body: { token },
  });
  if (!result.ok)
    return {
      ok: false as const,
      status: result.status,
      error: result.error,
      message: result.message,
    };
  return { ok: true as const, data: result.data };
}

export async function acceptInvitationAction(token: string) {
  return call<{ organizationId: string; role: string }>("/v1/invitations/accept", "POST", {
    token,
  });
}
