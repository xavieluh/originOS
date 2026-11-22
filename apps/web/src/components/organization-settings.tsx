"use client";

import { Badge, Button, Card, DataTable, EmptyState, SelectField, TextField } from "@originos/ui";
import { ClientForm } from "./client-form";
import { useRouter } from "next/navigation";
import { type FormEvent } from "react";
import {
  changeRoleAction,
  inviteMemberAction,
  removeMemberAction,
  renameOrganizationAction,
  revokeInvitationAction,
  transferOwnershipAction,
} from "../app/actions/tenancy";
import { ConfirmButton, useAction } from "./action-helpers";
import { FormMessage } from "./auth/auth-panel";
import {
  describeAuditAction,
  type AuditEventRow,
  type InvitationRow,
  type OrganizationDetail,
} from "../lib/organization-types";
import { can, type PermissionMatrix } from "../lib/access-types";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function OrganizationSettings({
  detail,
  myUserId,
  invitations,
  auditEvents,
  emailConfigured,
  permissions,
}: {
  readonly detail: OrganizationDetail;
  readonly myUserId: string;
  readonly invitations: readonly InvitationRow[] | null;
  readonly auditEvents: readonly AuditEventRow[] | null;
  readonly emailConfigured: boolean;
  /** From GET /v1/me/permissions. Controls follow it; the API enforces it regardless. */
  readonly permissions: PermissionMatrix | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <OrganizationProfile detail={detail} canEdit={can(permissions, "write", "organization")} />
      <Members
        detail={detail}
        myUserId={myUserId}
        canManage={can(permissions, "admin", "members")}
        canTransfer={can(permissions, "admin", "organization")}
      />
      {invitations ? (
        <Invitations
          rows={invitations}
          emailConfigured={emailConfigured}
          canInvite={can(permissions, "write", "invitations")}
        />
      ) : null}
      {auditEvents ? <AuditLog rows={auditEvents} /> : null}
    </div>
  );
}

function OrganizationProfile({
  detail,
  canEdit,
}: {
  readonly detail: OrganizationDetail;
  readonly canEdit: boolean;
}) {
  const { run, messages } = useAction();
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    void run(() => renameOrganizationAction(name), "Organization renamed.");
  };
  return (
    <Card
      title="Organization"
      description={`Created ${formatDate(detail.organization.createdAt)}. Your role: ${detail.myRole}.`}
    >
      {canEdit ? (
        <ClientForm className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onSubmit}>
          <div className="flex-1">
            <TextField
              id="org-rename"
              name="name"
              label="Name"
              defaultValue={detail.organization.name}
              minLength={2}
              maxLength={80}
              required
            />
          </div>
          <Button action="organization.rename" type="submit">
            Save name
          </Button>
        </ClientForm>
      ) : (
        <p className="text-sm">{detail.organization.name}</p>
      )}
      <div className="mt-3 flex flex-col gap-2">{messages}</div>
    </Card>
  );
}

function Members({
  detail,
  myUserId,
  canManage: manage,
  canTransfer: isOwner,
}: {
  readonly detail: OrganizationDetail;
  readonly myUserId: string;
  readonly canManage: boolean;
  readonly canTransfer: boolean;
}) {
  const { run, messages } = useAction();
  const router = useRouter();
  const leave = async () => {
    if (await run(() => removeMemberAction(myUserId))) router.push("/onboarding");
  };
  return (
    <Card
      title="Members"
      description="Owners and admins manage members and invitations. There is exactly one owner; ownership can be transferred to another member."
    >
      <DataTable
        caption="Members of this organization"
        captionHidden
        rowKey={(m) => m.userId}
        rows={detail.members}
        empty={<EmptyState title="No members" />}
        columns={[
          {
            key: "name",
            header: "Member",
            cell: (m) => (
              <span>
                <span className="block font-medium">
                  {m.name}
                  {m.userId === myUserId ? <span className="text-fg-muted"> (you)</span> : null}
                </span>
                <span className="block text-xs text-fg-muted">{m.email}</span>
              </span>
            ),
          },
          {
            key: "role",
            header: "Role",
            cell: (m) =>
              manage && m.role !== "owner" && m.userId !== myUserId ? (
                <SelectField
                  id={`role-${m.userId}`}
                  label={`Role for ${m.name}`}
                  className="w-32"
                  value={m.role}
                  onChange={(e) =>
                    void run(
                      () => changeRoleAction(m.userId, e.target.value as "admin" | "member"),
                      `${m.name} is now ${e.target.value}.`,
                    )
                  }
                  options={[
                    { value: "member", label: "Member" },
                    { value: "admin", label: "Admin" },
                  ]}
                />
              ) : (
                <Badge label={m.role} tone={m.role === "owner" ? "accent" : "neutral"} />
              ),
          },
          { key: "joined", header: "Joined", cell: (m) => formatDate(m.joinedAt), mono: true },
          {
            key: "actions",
            header: "Actions",
            align: "end",
            cell: (m) => {
              if (m.role === "owner") return <span className="text-xs text-fg-muted">Owner</span>;
              if (m.userId === myUserId)
                return (
                  <ConfirmButton
                    action="member.leave"
                    label="Leave"
                    confirmLabel="Confirm leave"
                    onConfirm={() => void leave()}
                  />
                );
              return (
                <span className="inline-flex flex-wrap justify-end gap-2">
                  {isOwner ? (
                    <ConfirmButton
                      action="member.make-owner"
                      label="Make owner"
                      confirmLabel={`Transfer to ${m.name}`}
                      onConfirm={() =>
                        void run(
                          () => transferOwnershipAction(m.userId),
                          `${m.name} is now the owner. You are an admin.`,
                        )
                      }
                    />
                  ) : null}
                  {manage ? (
                    <ConfirmButton
                      action="member.remove"
                      label="Remove"
                      confirmLabel="Confirm remove"
                      onConfirm={() =>
                        void run(() => removeMemberAction(m.userId), `${m.name} was removed.`)
                      }
                    />
                  ) : null}
                </span>
              );
            },
          },
        ]}
      />
      <div className="mt-3 flex flex-col gap-2">{messages}</div>
    </Card>
  );
}

const statusTone = {
  pending: "info",
  accepted: "positive",
  revoked: "neutral",
  expired: "warning",
} as const;

function Invitations({
  rows,
  emailConfigured,
  canInvite,
}: {
  readonly rows: readonly InvitationRow[];
  readonly emailConfigured: boolean;
  readonly canInvite: boolean;
}) {
  const { run, messages } = useAction();
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const role = data.get("role") === "admin" ? "admin" : "member";
    if (
      await run(
        () => inviteMemberAction(email, role),
        `Invitation sent to ${email}. It expires in 7 days.`,
      )
    )
      form.reset();
  };
  return (
    <Card
      title="Invitations"
      description="Invitations are single-use, expire after 7 days, and only work for the invited email address once verified."
    >
      {!canInvite ? null : emailConfigured ? (
        <ClientForm
          className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => void onSubmit(e)}
        >
          <div className="flex-1">
            <TextField
              id="invite-email"
              name="email"
              type="email"
              label="Email address"
              autoComplete="off"
              required
            />
          </div>
          <SelectField
            id="invite-role"
            name="role"
            label="Role"
            defaultValue="member"
            options={[
              { value: "member", label: "Member" },
              { value: "admin", label: "Admin" },
            ]}
          />
          <Button action="invitation.send" type="submit" variant="primary">
            Send invitation
          </Button>
        </ClientForm>
      ) : (
        <div className="mb-4">
          <FormMessage tone="error">
            Email delivery is not set up for this deployment, so invitations cannot be sent.
          </FormMessage>
        </div>
      )}
      <div className="mb-3 flex flex-col gap-2">{messages}</div>
      <DataTable
        caption="Invitations"
        captionHidden
        rowKey={(i) => i.id}
        rows={rows}
        empty={<EmptyState title="No invitations yet" />}
        columns={[
          { key: "email", header: "Email", cell: (i) => i.email },
          { key: "role", header: "Role", cell: (i) => i.role },
          {
            key: "status",
            header: "Status",
            cell: (i) => <Badge label={i.status} tone={statusTone[i.status]} />,
          },
          { key: "expires", header: "Expires", cell: (i) => formatDate(i.expiresAt), mono: true },
          {
            key: "actions",
            header: "Actions",
            align: "end",
            cell: (i) =>
              canInvite && i.status === "pending" ? (
                <ConfirmButton
                  action="invitation.revoke"
                  label="Revoke"
                  confirmLabel="Confirm revoke"
                  onConfirm={() =>
                    void run(
                      () => revokeInvitationAction(i.id),
                      `Invitation to ${i.email} revoked.`,
                    )
                  }
                />
              ) : null,
          },
        ]}
      />
    </Card>
  );
}

function AuditLog({ rows }: { readonly rows: readonly AuditEventRow[] }) {
  return (
    <Card
      title="Activity"
      description="The 50 most recent account, membership, permission and consent events. This log is append-only."
    >
      <DataTable
        caption="Organization activity"
        captionHidden
        rowKey={(r) => r.id}
        rows={rows}
        empty={<EmptyState title="No activity yet" />}
        columns={[
          { key: "when", header: "When", cell: (r) => formatTime(r.occurredAt), mono: true },
          { key: "who", header: "Who", cell: (r) => r.actorName ?? "Deleted user" },
          { key: "what", header: "What", cell: (r) => describeAuditAction(r.action) },
        ]}
      />
    </Card>
  );
}
