import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getMe } from "./api";
import type { Me, WorkspaceSession } from "./session-types";
import { REQUEST_PATH_HEADER, safeNextPath } from "./session-cookie";

export type { WorkspaceSession } from "./session-types";

async function signInRedirect(): Promise<never> {
  const path = safeNextPath((await headers()).get(REQUEST_PATH_HEADER), "/home");
  redirect(`/sign-in?next=${encodeURIComponent(path)}`);
}

/** Signed in, or redirected to sign-in. Verified with the API on every request. */
export async function requireMe(): Promise<Me> {
  const me = await getMe();
  if (!me) return signInRedirect();
  return me;
}

/**
 * Signed in with an active organization the person still belongs to; otherwise
 * redirected to sign-in or to onboarding (create or pick an organization).
 */
export async function requireWorkspace(): Promise<WorkspaceSession> {
  const me = await requireMe();
  const active = me.memberships.find((m) => m.organizationId === me.activeOrganizationId);
  if (!active) redirect("/onboarding");
  return { me, active };
}
