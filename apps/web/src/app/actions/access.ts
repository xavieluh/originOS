"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "../../lib/api";
import type { Action, ConsentPurpose, ResourceType } from "../../lib/access-types";
import type { ActionResult } from "./tenancy";

async function call<T>(path: string, method: string, body?: unknown): Promise<ActionResult<T>> {
  const result = await apiFetch<T>(path, { method, ...(body !== undefined ? { body } : {}) });
  if (!result.ok) return { ok: false, error: result.error, message: result.message };
  if (method !== "GET") revalidatePath("/", "layout");
  return { ok: true, data: result.data };
}

const id = (value: string) => encodeURIComponent(value);

export async function createAgentAction(name: string, description: string) {
  return call<{ id: string; name: string }>("/v1/organization/agents", "POST", {
    name,
    ...(description ? { description } : {}),
  });
}

export async function disableAgentAction(agentId: string) {
  return call(`/v1/organization/agents/${id(agentId)}/disable`, "POST", {});
}

export interface GrantInput {
  readonly subjectType: "user" | "agent";
  readonly subjectId: string;
  readonly effect: "allow" | "deny";
  readonly resourceType: ResourceType | "*";
  readonly actions: Action[];
  readonly reason: string;
}

export async function createGrantAction(input: GrantInput) {
  const { reason, ...rest } = input;
  return call("/v1/organization/grants", "POST", { ...rest, ...(reason ? { reason } : {}) });
}

export async function revokeGrantAction(grantId: string) {
  return call(`/v1/organization/grants/${id(grantId)}/revoke`, "POST", {});
}

const consentBase = (scope: "me" | "organization") =>
  scope === "me" ? "/v1/me/consents" : "/v1/organization/consents";

export async function giveConsentAction(
  scope: "me" | "organization",
  purpose: ConsentPurpose,
  scopeKey: string,
) {
  return call(consentBase(scope), "POST", { purpose, ...(scopeKey ? { scopeKey } : {}) });
}

export async function revokeConsentAction(scope: "me" | "organization", consentId: string) {
  return call(`${consentBase(scope)}/${id(consentId)}/revoke`, "POST", {});
}
