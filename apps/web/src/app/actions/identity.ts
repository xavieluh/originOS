"use server";

import type {
  DomainProofStart,
  ModerationInput,
  ProfileCreate,
  ProfileDetail,
  ProfileUpdate,
  ProofView,
  ReviewDecisionInput,
  ReviewRequest,
  ReviewView,
} from "@originos/contracts";
import { revalidatePath } from "next/cache";
import { apiFetch } from "../../lib/api";
import type { ActionResult } from "./tenancy";

async function call<T>(path: string, method: string, body: unknown = {}): Promise<ActionResult<T>> {
  const result = await apiFetch<T>(path, { method, body });
  if (!result.ok) return { ok: false, error: result.error, message: result.message };
  revalidatePath("/trust", "layout");
  return { ok: true, data: result.data };
}

const id = (value: string) => encodeURIComponent(value);

export async function createProfileAction(input: ProfileCreate) {
  return call<ProfileDetail>("/v1/profiles", "POST", input);
}

export async function updateProfileAction(profileId: string, input: ProfileUpdate) {
  return call<ProfileDetail>(`/v1/profiles/${id(profileId)}`, "PATCH", input);
}

export async function moderateProfileAction(profileId: string, input: ModerationInput) {
  return call<ProfileDetail>(`/v1/profiles/${id(profileId)}/moderation`, "POST", input);
}

export async function startDomainProofAction(profileId: string, input: DomainProofStart) {
  return call<ProofView>(`/v1/profiles/${id(profileId)}/proofs/domain`, "POST", input);
}

export async function checkProofAction(profileId: string, proofId: string) {
  return call<{ jobId: string }>(
    `/v1/profiles/${id(profileId)}/proofs/${id(proofId)}/check`,
    "POST",
  );
}

export async function setProofVisibilityAction(
  profileId: string,
  proofId: string,
  visibility: "public" | "tenant",
) {
  return call<ProofView>(`/v1/profiles/${id(profileId)}/proofs/${id(proofId)}`, "PATCH", {
    visibility,
  });
}

export async function revokeProofAction(profileId: string, proofId: string) {
  return call<ProofView>(`/v1/profiles/${id(profileId)}/proofs/${id(proofId)}/revoke`, "POST");
}

/** Returns the provider's authorization URL; the browser goes there next. */
export async function startAccountProofAction(profileId: string, provider: string) {
  return call<{ authorizeUrl: string }>(
    `/v1/profiles/${id(profileId)}/proofs/account/${id(provider)}/start`,
    "POST",
  );
}

export async function requestReviewAction(profileId: string, input: ReviewRequest) {
  return call<ReviewView>(`/v1/profiles/${id(profileId)}/reviews`, "POST", input);
}

export async function decideReviewAction(reviewId: string, input: ReviewDecisionInput) {
  return call<ReviewView>(`/v1/identity/reviews/${id(reviewId)}/decision`, "POST", input);
}

export async function withdrawReviewAction(reviewId: string) {
  return call<ReviewView>(`/v1/identity/reviews/${id(reviewId)}/withdraw`, "POST");
}

export async function revokeReviewAction(reviewId: string, reason: string) {
  return call<ReviewView>(`/v1/identity/reviews/${id(reviewId)}/revoke`, "POST", { reason });
}
