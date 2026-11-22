"use server";

import type { ResumeDecision } from "@originos/contracts";
import { revalidatePath } from "next/cache";
import { apiFetch } from "../../lib/api";
import type { FilePreview } from "../../lib/file-types";
import type { ActionResult } from "./tenancy";

async function call<T>(path: string, method: string, body?: unknown): Promise<ActionResult<T>> {
  const result = await apiFetch<T>(path, { method, ...(body !== undefined ? { body } : {}) });
  if (!result.ok) return { ok: false, error: result.error, message: result.message };
  if (method !== "GET") revalidatePath("/settings", "layout");
  return { ok: true, data: result.data };
}

const id = (value: string) => encodeURIComponent(value);

/** A one-minute signed link; the browser follows it straight away. */
export async function downloadFileAction(uploadId: string) {
  return call<{ url: string; expiresAt: string }>(`/v1/files/${id(uploadId)}/download`, "POST", {});
}

export async function previewFileAction(uploadId: string) {
  return call<FilePreview>(`/v1/files/${id(uploadId)}/preview`, "GET");
}

export async function retryJobAction(jobId: string) {
  return call(`/v1/organization/jobs/${id(jobId)}/retry`, "POST", {});
}

export async function cancelJobAction(jobId: string) {
  return call(`/v1/organization/jobs/${id(jobId)}/cancel`, "POST", {});
}

export async function resumeJobAction(jobId: string, decision: ResumeDecision) {
  return call(`/v1/organization/jobs/${id(jobId)}/resume`, "POST", decision);
}
