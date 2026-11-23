"use client";

import type {
  AccountProofProvider,
  ClaimType,
  ModerationState,
  ProfileDetail,
  ProfileView,
  ProofView,
  ReviewView,
} from "@originos/contracts";
import {
  Badge,
  type BadgeTone,
  Button,
  buttonClassName,
  Card,
  Checkbox,
  EmptyState,
  SelectField,
  TextArea,
  TextField,
} from "@originos/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import {
  checkProofAction,
  createProfileAction,
  decideReviewAction,
  moderateProfileAction,
  requestReviewAction,
  revokeProofAction,
  revokeReviewAction,
  setProofVisibilityAction,
  startAccountProofAction,
  startDomainProofAction,
  updateProfileAction,
  withdrawReviewAction,
} from "../app/actions/identity";
import { ConfirmButton, useAction } from "./action-helpers";
import { FormMessage } from "./auth/auth-panel";

const VISIBILITY_OPTIONS = [
  { value: "public", label: "Public: anyone can open /p/<handle>" },
  { value: "tenant", label: "Organization: members of this organization" },
  { value: "private", label: "Private: only you (and owners and admins)" },
];

const PROOF_STATUS: Record<ProofView["status"], { label: string; tone: BadgeTone }> = {
  pending: { label: "waiting for the check", tone: "info" },
  verified: { label: "verified", tone: "positive" },
  stale: { label: "stale", tone: "warning" },
  revoked: { label: "revoked", tone: "negative" },
};

const PROOF_EXPIRED = { label: "expired", tone: "warning" } as const satisfies {
  label: string;
  tone: BadgeTone;
};

const MODERATION: Record<ModerationState, { label: string; tone: BadgeTone }> = {
  active: { label: "active", tone: "positive" },
  hidden: { label: "hidden by moderators", tone: "warning" },
  suspended: { label: "suspended", tone: "negative" },
};

const REVIEW_STATUS: Record<ReviewView["status"], { label: string; tone: BadgeTone }> = {
  pending: { label: "waiting for a reviewer", tone: "info" },
  approved: { label: "approved", tone: "positive" },
  rejected: { label: "rejected", tone: "negative" },
  withdrawn: { label: "withdrawn", tone: "neutral" },
  revoked: { label: "revoked", tone: "negative" },
};

const CLAIM_TYPES: { value: ClaimType; label: string }[] = [
  { value: "affiliation", label: "Affiliation (for example: staff writer at a publication)" },
  { value: "former_name", label: "Former name or handle" },
  { value: "other", label: "Other claim" },
];

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const text = (f: FormData, name: string) => String(f.get(name) ?? "").trim();
const checked = (f: FormData, name: string) => f.get(name) === "on";

function onSubmit(handler: (form: FormData, el: HTMLFormElement) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handler(new FormData(event.currentTarget), event.currentTarget);
  };
}

export function ModerationBadge({ state }: { readonly state: ModerationState }) {
  return <Badge label={MODERATION[state].label} tone={MODERATION[state].tone} />;
}

// --- Profiles -----------------------------------------------------------------

export function CreateProfileForm({
  canCreateOrganization,
}: {
  readonly canCreateOrganization: boolean;
}) {
  const { run, messages } = useAction();
  const router = useRouter();
  return (
    <Card
      title="Create a profile"
      description="A profile is how you appear on OriginOS. Its name can be a pseudonym: OriginOS never shows your account name or email on it."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={onSubmit((f) => {
          void (async () => {
            let profileId: string | null = null;
            const ok = await run(async () => {
              const result = await createProfileAction({
                kind: text(f, "kind") === "organization" ? "organization" : "creator",
                handle: text(f, "handle").toLowerCase(),
                displayName: text(f, "displayName"),
                bio: text(f, "bio"),
                visibility: text(f, "visibility") as "public" | "tenant" | "private",
                pseudonymous: checked(f, "pseudonymous"),
                discoverable: checked(f, "discoverable"),
              });
              if (result.ok) profileId = result.data.profile.id;
              return result;
            });
            if (ok && profileId) router.push(`/trust/profiles/${profileId}`);
          })();
        })}
      >
        {canCreateOrganization ? (
          <SelectField
            id="profile-kind"
            name="kind"
            label="Profile for"
            options={[
              { value: "creator", label: "Me (a creator profile)" },
              { value: "organization", label: "This organization" },
            ]}
          />
        ) : null}
        <TextField
          id="profile-handle"
          name="handle"
          label="Handle"
          description="3 to 30 lowercase letters, digits or hyphens. Your public page is /p/<handle>."
          required
          pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]"
        />
        <TextField
          id="profile-name"
          name="displayName"
          label="Display name"
          required
          maxLength={80}
        />
        <TextArea id="profile-bio" name="bio" label="Short bio" maxLength={500} />
        <SelectField
          id="profile-visibility"
          name="visibility"
          label="Who can see it"
          options={VISIBILITY_OPTIONS}
          defaultValue="tenant"
        />
        <Checkbox
          id="profile-pseudonymous"
          name="pseudonymous"
          label="This name is a pseudonym"
          description="The page says so, and that OriginOS shows no legal identity."
        />
        <Checkbox
          id="profile-discoverable"
          name="discoverable"
          label="Let search engines index the public page"
          defaultChecked
        />
        <div aria-live="polite" className="flex flex-col gap-2">
          {messages}
        </div>
        <div>
          <Button action="identity.profile-create" type="submit" variant="primary">
            Create profile
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function ProfileSettings({ profile }: { readonly profile: ProfileView }) {
  const { run, messages } = useAction();
  return (
    <Card title="Profile and privacy" description="Changes apply to the public page at once.">
      <form
        className="flex flex-col gap-4"
        onSubmit={onSubmit(
          (f) =>
            void run(
              () =>
                updateProfileAction(profile.id, {
                  handle: text(f, "handle").toLowerCase(),
                  displayName: text(f, "displayName"),
                  bio: text(f, "bio") || null,
                  visibility: text(f, "visibility") as "public" | "tenant" | "private",
                  pseudonymous: checked(f, "pseudonymous"),
                  discoverable: checked(f, "discoverable"),
                }),
              "Profile saved.",
            ),
        )}
      >
        <TextField
          id="edit-handle"
          name="handle"
          label="Handle"
          defaultValue={profile.handle}
          required
        />
        <TextField
          id="edit-name"
          name="displayName"
          label="Display name"
          defaultValue={profile.displayName}
          required
          maxLength={80}
        />
        <TextArea
          id="edit-bio"
          name="bio"
          label="Short bio"
          defaultValue={profile.bio ?? ""}
          maxLength={500}
        />
        <SelectField
          id="edit-visibility"
          name="visibility"
          label="Who can see it"
          options={VISIBILITY_OPTIONS}
          defaultValue={profile.visibility}
        />
        <Checkbox
          id="edit-pseudonymous"
          name="pseudonymous"
          label="This name is a pseudonym"
          defaultChecked={profile.pseudonymous}
        />
        <Checkbox
          id="edit-discoverable"
          name="discoverable"
          label="Let search engines index the public page"
          defaultChecked={profile.discoverable}
        />
        <div aria-live="polite" className="flex flex-col gap-2">
          {messages}
        </div>
        <div>
          <Button action="identity.profile-save" type="submit">
            Save profile
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function ModerationPanel({ profile }: { readonly profile: ProfileView }) {
  const { run, messages } = useAction();
  return (
    <Card
      title="Moderation"
      description="Owners and admins can hide a profile from the public network, or suspend it so its owner cannot change it. A reason is required and recorded."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={onSubmit(
          (f) =>
            void run(
              () =>
                moderateProfileAction(profile.id, {
                  state: text(f, "state") as ModerationState,
                  reason: text(f, "reason"),
                }),
              "Moderation state saved.",
            ),
        )}
      >
        <SelectField
          id="moderation-state"
          name="state"
          label="State"
          defaultValue={profile.moderationState}
          options={[
            { value: "active", label: "Active" },
            { value: "hidden", label: "Hidden from the public network" },
            { value: "suspended", label: "Suspended" },
          ]}
        />
        <TextField
          id="moderation-reason"
          name="reason"
          label="Reason"
          required
          minLength={3}
          maxLength={500}
        />
        <div aria-live="polite" className="flex flex-col gap-2">
          {messages}
        </div>
        <div>
          <Button action="identity.moderate" type="submit" variant="secondary">
            Save moderation state
          </Button>
        </div>
      </form>
    </Card>
  );
}

// --- Proofs -----------------------------------------------------------------

function ProofRow({
  proof,
  canManage,
  canRevoke,
}: {
  readonly proof: ProofView;
  readonly canManage: boolean;
  readonly canRevoke: boolean;
}) {
  const { run, messages } = useAction();
  // A verified proof past its expiry no longer backs the profile (badges.ts says the same).
  const expired = proof.expired;
  const s = expired ? PROOF_EXPIRED : PROOF_STATUS[proof.status];
  const live = proof.status !== "revoked";
  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-border p-4"
      data-proof-status={proof.status}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {proof.kind === "domain" ? proof.label : `${proof.provider} account ${proof.label}`}
        </span>
        <Badge label={s.label} tone={s.tone} />
        <Badge
          label={proof.visibility === "public" ? "shown publicly" : "organization only"}
          tone="neutral"
        />
      </div>
      {proof.instructions && proof.status === "pending" ? (
        <div className="flex flex-col gap-1 text-sm">
          <p>
            {proof.instructions.method === "dns_txt"
              ? "Add a DNS TXT record:"
              : "Publish a plain-text file at:"}
          </p>
          <code className="break-all rounded bg-surface-alt px-2 py-1 text-xs">
            {proof.instructions.location}
          </code>
          <p>
            {proof.instructions.method === "dns_txt" ? "with the value:" : "containing exactly:"}
          </p>
          <code className="break-all rounded bg-surface-alt px-2 py-1 text-xs" data-challenge>
            {proof.instructions.value}
          </code>
        </div>
      ) : null}
      {proof.lastCheckError && proof.status === "pending" ? (
        <p className="text-sm text-fg-muted">Last check: {proof.lastCheckError}</p>
      ) : null}
      {proof.staleReason && proof.status === "stale" ? (
        <p className="text-sm">{proof.staleReason}</p>
      ) : null}
      <p className="text-xs text-fg-muted">
        {proof.lastVerifiedAt ? `Last passed ${formatTime(proof.lastVerifiedAt)}. ` : ""}
        {proof.expiresAt && proof.status === "verified"
          ? expired
            ? `Expired ${formatTime(proof.expiresAt)}; check or prove it again to renew. `
            : `Expires ${formatTime(proof.expiresAt)} unless re-checked. `
          : ""}
        {proof.lastCheckedAt ? `Last checked ${formatTime(proof.lastCheckedAt)}.` : ""}
        {proof.revokedAt
          ? `Revoked ${formatTime(proof.revokedAt)} (${proof.revokedReason?.replace("_", " ")}).`
          : ""}
      </p>
      <div aria-live="polite" className="flex flex-col gap-2">
        {messages}
      </div>
      {live ? (
        <span className="inline-flex flex-wrap gap-2">
          {canManage && proof.kind === "domain" ? (
            <Button
              action="identity.proof-check"
              size="sm"
              variant="secondary"
              onClick={() =>
                void run(
                  () => checkProofAction(proof.profileId, proof.id),
                  `Checking ${proof.label}. Reload in a few seconds to see the result.`,
                )
              }
            >
              {proof.status === "pending" ? "Check now" : "Re-check now"}
            </Button>
          ) : null}
          {canManage ? (
            <Button
              action="identity.proof-visibility"
              size="sm"
              variant="ghost"
              onClick={() =>
                void run(() =>
                  setProofVisibilityAction(
                    proof.profileId,
                    proof.id,
                    proof.visibility === "public" ? "tenant" : "public",
                  ),
                )
              }
            >
              {proof.visibility === "public"
                ? "Show only in the organization"
                : "Show on the public page"}
            </Button>
          ) : null}
          {canRevoke ? (
            <ConfirmButton
              action="identity.proof-revoke"
              label={canManage ? "Withdraw" : "Revoke"}
              confirmLabel={canManage ? "Confirm withdraw" : "Confirm revoke"}
              onConfirm={() => void run(() => revokeProofAction(proof.profileId, proof.id))}
            />
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

export function ProofsPanel({
  detail,
  providers,
}: {
  readonly detail: ProfileDetail;
  readonly providers: readonly AccountProofProvider[];
}) {
  const { run, messages } = useAction();
  const { profile, proofs } = detail;
  const canManage =
    profile.canManage && (profile.moderationState !== "suspended" || detail.canModerate);
  return (
    <Card
      title="Ownership proofs"
      description="Prove you control a website or an account. A domain counts only when OriginOS finds the one-time value you publish; typing a domain proves nothing. A proof shows control at the time of the check, not legal ownership or identity."
    >
      <div className="flex flex-col gap-6">
        {proofs.length === 0 ? (
          <EmptyState title="No proofs yet">
            {canManage
              ? "Add a domain or prove an account below."
              : "The profile's owner has not added any."}
          </EmptyState>
        ) : (
          <ul className="grid gap-3" aria-label="Proofs">
            {proofs.map((p) => (
              <ProofRow
                key={p.id}
                proof={p}
                canManage={canManage}
                canRevoke={canManage || detail.canModerate}
              />
            ))}
          </ul>
        )}
        {canManage ? (
          <>
            <form
              className="flex flex-col gap-4 border-t border-border pt-4"
              aria-label="Prove a domain"
              onSubmit={onSubmit(
                (f, el) =>
                  void run(
                    () =>
                      startDomainProofAction(profile.id, {
                        domain: text(f, "domain"),
                        method: text(f, "method") === "html_file" ? "html_file" : "dns_txt",
                        visibility: checked(f, "public") ? "public" : "tenant",
                      }),
                    "Challenge created. Publish the value shown, then select Check now.",
                  ).then((ok) => ok && el.reset()),
              )}
            >
              <h3 className="font-display text-base font-semibold">Prove a domain</h3>
              <TextField
                id="proof-domain"
                name="domain"
                label="Domain"
                placeholder="example.com"
                required
              />
              <SelectField
                id="proof-method"
                name="method"
                label="How you will prove it"
                options={[
                  { value: "dns_txt", label: "DNS TXT record" },
                  { value: "html_file", label: "File on the website (HTTPS)" },
                ]}
              />
              <Checkbox
                id="proof-public"
                name="public"
                label="Show this proof on the public page"
                defaultChecked
              />
              <div>
                <Button action="identity.proof-domain" type="submit" variant="secondary">
                  Get a challenge
                </Button>
              </div>
            </form>
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <h3 className="font-display text-base font-semibold">Prove an account</h3>
              <p className="text-sm text-fg-muted">
                You sign in at the provider and approve. OriginOS asks for no permissions, reads
                only the account&apos;s id and name, and keeps no token.
              </p>
              <ul className="flex flex-col gap-2">
                {providers.map((pr) => (
                  <li key={pr.id} className="flex flex-wrap items-center gap-2">
                    {pr.configured ? (
                      <Button
                        action="identity.proof-account"
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void (async () => {
                            const result = await startAccountProofAction(profile.id, pr.id);
                            if (result.ok) window.location.assign(result.data.authorizeUrl);
                            else await run(async () => result);
                          })()
                        }
                      >
                        Prove a {pr.name} account
                      </Button>
                    ) : (
                      <>
                        <span className="text-sm font-medium">{pr.name}</span>
                        <Badge label="not set up" tone="neutral" />
                        <span className="text-sm text-fg-muted">{pr.setupHint}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
        <div aria-live="polite" className="flex flex-col gap-2">
          {messages}
        </div>
      </div>
    </Card>
  );
}

// --- Reviews ----------------------------------------------------------------

export function ClaimRequestForm({ profileId }: { readonly profileId: string }) {
  const { run, messages } = useAction();
  return (
    <Card
      title="Ask for a claim to be reviewed"
      description="For things OriginOS cannot check by itself. An owner or admin of this organization, other than you, looks at your evidence and decides. Approved claims show who reviewed them and when."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={onSubmit((f, el) => {
          const url = text(f, "url");
          const note = text(f, "note");
          void run(
            () =>
              requestReviewAction(profileId, {
                kind: "claim",
                claimType: text(f, "claimType") as ClaimType,
                statement: text(f, "statement"),
                evidence: [
                  ...(url ? [{ kind: "url" as const, url }] : []),
                  ...(note ? [{ kind: "note" as const, note }] : []),
                ],
                visibility: checked(f, "public") ? "public" : "tenant",
              }),
            "Sent for review.",
          ).then((ok) => ok && el.reset());
        })}
      >
        <SelectField id="claim-type" name="claimType" label="Kind of claim" options={CLAIM_TYPES} />
        <TextField
          id="claim-statement"
          name="statement"
          label="Claim"
          required
          minLength={3}
          maxLength={300}
        />
        <TextField
          id="claim-url"
          name="url"
          label="Evidence link"
          type="url"
          placeholder="https://"
        />
        <TextArea
          id="claim-note"
          name="note"
          label="Evidence note"
          maxLength={1000}
          description="At least one link or note is required."
        />
        <Checkbox
          id="claim-public"
          name="public"
          label="Show the approved claim on the public page"
          defaultChecked
        />
        <div aria-live="polite" className="flex flex-col gap-2">
          {messages}
        </div>
        <div>
          <Button action="identity.claim-request" type="submit" variant="secondary">
            Send for review
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function OwnershipRequestForm({ profileId }: { readonly profileId: string }) {
  const { run, messages } = useAction();
  return (
    <Card
      title="Request ownership of this profile"
      description="For account recovery (you lost access to the account that owns it) or a handover. An owner or admin decides. If approved, the profile moves to you and its existing proofs end; you prove them again. Proving the same domain or account on your own profile first is strong evidence."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={onSubmit(
          (f) =>
            void run(
              () =>
                requestReviewAction(profileId, {
                  kind: "ownership",
                  reason: text(f, "reason") === "handover" ? "handover" : "recovery",
                  statement: text(f, "statement"),
                  evidence: [],
                }),
              "Request sent.",
            ),
        )}
      >
        <SelectField
          id="ownership-reason"
          name="reason"
          label="Reason"
          options={[
            { value: "recovery", label: "Recovery: I lost access to the account that owns it" },
            { value: "handover", label: "Handover: the current owner is passing it on" },
          ]}
        />
        <TextArea
          id="ownership-statement"
          name="statement"
          label="Explain"
          required
          minLength={3}
          maxLength={1000}
        />
        <div aria-live="polite" className="flex flex-col gap-2">
          {messages}
        </div>
        <div>
          <Button action="identity.ownership-request" type="submit" variant="secondary">
            Request ownership
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ReviewItem({
  review,
  showProfile,
  canRevoke,
  onDecided,
}: {
  readonly review: ReviewView;
  readonly showProfile: boolean;
  readonly canRevoke: boolean;
  /** Told after a decision; the list shows the confirmation because the item leaves "Waiting". */
  readonly onDecided: () => void;
}) {
  const { run, messages } = useAction();
  const s = REVIEW_STATUS[review.status];
  const title =
    review.kind === "claim"
      ? `Claim: ${review.statement}`
      : `Ownership request (${review.ownershipReason ?? "recovery"})`;
  return (
    <li
      className="flex flex-col gap-3 rounded-md border border-border p-4"
      data-review-status={review.status}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{title}</span>
        <Badge label={s.label} tone={s.tone} />
      </div>
      <p className="text-sm text-fg-muted">
        {showProfile ? (
          <>
            Profile{" "}
            <a className="underline" href={`/trust/profiles/${review.profileId}`}>
              {review.profileDisplayName}
            </a>{" "}
            (@{review.profileHandle}) ·{" "}
          </>
        ) : null}
        Requested by {review.isMine ? "you" : (review.requestedBy.name ?? "a former member")} on{" "}
        {formatTime(review.createdAt)}
      </p>
      {review.kind === "ownership" ? <p className="text-sm">{review.statement}</p> : null}
      <div className="text-sm">
        <p className="font-medium">Evidence</p>
        {review.evidence.length === 0 && review.matchingProofs.length === 0 ? (
          <p className="text-fg-muted">None submitted.</p>
        ) : (
          <ul className="list-disc pl-5">
            {review.evidence.map((e, i) => (
              <li key={i}>
                {e.kind === "url" ? (
                  <>
                    Link (not opened by OriginOS):{" "}
                    <code className="break-all text-xs">{e.url}</code>
                    {e.note ? ` (${e.note})` : null}
                  </>
                ) : (
                  <>Note: {e.note}</>
                )}
              </li>
            ))}
            {review.matchingProofs.map((m, i) => (
              <li key={`m${i}`}>
                The profile proved {m.kind === "domain" ? "the domain" : "the account"} {m.label}.{" "}
                {m.requesterHolds
                  ? "The requester's own profile proves it today (checked by OriginOS)."
                  : "The requester does not prove it today."}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-fg-muted">
          Evidence fingerprint (SHA-256, recorded with the decision):{" "}
          <code className="break-all">{review.evidenceHash}</code>
        </p>
      </div>
      {review.decidedAt ? (
        <p className="text-sm">
          {review.status === "withdrawn"
            ? ""
            : `Decided by ${review.decidedBy?.name ?? "a former member"} on ${formatTime(review.decidedAt)}: `}
          {review.decisionReason}
        </p>
      ) : null}
      {review.revokedAt ? (
        <p className="text-sm">
          Revoked {formatTime(review.revokedAt)}: {review.revokedReason}
        </p>
      ) : null}
      <div aria-live="polite" className="flex flex-col gap-2">
        {messages}
      </div>
      {review.canDecide ? (
        <form
          className="flex flex-col gap-3"
          aria-label={`Decide: ${title}`}
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            const submitter = (event.nativeEvent as SubmitEvent)
              .submitter as HTMLButtonElement | null;
            void run(() =>
              decideReviewAction(review.id, {
                decision: submitter?.value === "reject" ? "reject" : "approve",
                reason: text(f, "reason"),
              }),
            ).then((ok) => ok && onDecided());
          }}
        >
          <TextField
            id={`reason-${review.id}`}
            name="reason"
            label="Reason for your decision"
            required
            minLength={3}
            maxLength={500}
          />
          <span className="inline-flex gap-2">
            <button
              type="submit"
              name="decision"
              value="approve"
              data-action="identity.review-approve"
              className={buttonClassName("primary", "sm")}
            >
              Approve
            </button>
            <button
              type="submit"
              name="decision"
              value="reject"
              data-action="identity.review-reject"
              className={buttonClassName("secondary", "sm")}
            >
              Reject
            </button>
          </span>
        </form>
      ) : null}
      {review.isMine && review.status === "pending" ? (
        <span>
          <ConfirmButton
            action="identity.review-withdraw"
            label="Withdraw request"
            confirmLabel="Confirm withdraw"
            onConfirm={() => void run(() => withdrawReviewAction(review.id), "Request withdrawn.")}
          />
        </span>
      ) : null}
      {review.kind === "claim" && review.status === "approved" && canRevoke ? (
        <span>
          <ConfirmButton
            action="identity.review-revoke"
            label="Revoke approval"
            confirmLabel="Confirm revoke"
            onConfirm={() =>
              void run(
                () => revokeReviewAction(review.id, "Revoked by a reviewer."),
                "Approval revoked.",
              )
            }
          />
        </span>
      ) : null}
    </li>
  );
}

export function ReviewList({
  reviews,
  showProfile,
  canRevoke,
  emptyTitle,
  emptyText,
}: {
  readonly reviews: readonly ReviewView[];
  readonly showProfile: boolean;
  readonly canRevoke: boolean;
  readonly emptyTitle: string;
  readonly emptyText: string;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <div aria-live="polite">
        {notice ? <FormMessage tone="info">{notice}</FormMessage> : null}
      </div>
      {reviews.length === 0 ? (
        <EmptyState title={emptyTitle}>{emptyText}</EmptyState>
      ) : (
        <ul className="grid gap-3" aria-label="Review requests">
          {reviews.map((r) => (
            <ReviewItem
              key={r.id}
              review={r}
              showProfile={showProfile}
              canRevoke={canRevoke}
              onDecided={() => setNotice("Decision recorded.")}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
