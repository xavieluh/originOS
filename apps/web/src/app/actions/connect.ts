"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "../../lib/api";
import type { ActionResult } from "./tenancy";

async function call<T>(path: string, body: unknown = {}): Promise<ActionResult<T>> {
  const result = await apiFetch<T>(path, { method: "POST", body });
  if (!result.ok) return { ok: false, error: result.error, message: result.message };
  revalidatePath("/integrations");
  return { ok: true, data: result.data };
}

const id = (value: string) => encodeURIComponent(value);

/** Returns the provider's authorization URL; the browser goes there next. */
export async function startConnectAction(provider: string) {
  return call<{ authorizeUrl: string }>(`/v1/organization/connections/${id(provider)}/start`);
}

export async function checkConnectionAction(connectionId: string) {
  return call<{ jobId: string }>(`/v1/organization/connections/${id(connectionId)}/check`);
}

export async function disconnectAction(connectionId: string) {
  return call(`/v1/organization/connections/${id(connectionId)}/disconnect`);
}
