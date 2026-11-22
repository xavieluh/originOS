"use client";

import { Badge, Button, Card, DataTable, EmptyState, TextField } from "@originos/ui";
import { giveConsentAction, revokeConsentAction } from "../app/actions/access";
import type { ConsentList, ConsentPurposeInfo, ConsentRecord } from "../lib/access-types";
import { ClientForm } from "./client-form";
import { ConfirmButton, useAction } from "./action-helpers";

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function ConsentSettings({
  personal,
  organization,
  canManageOrganization,
}: {
  readonly personal: ConsentList;
  readonly organization: ConsentList | null;
  readonly canManageOrganization: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <ConsentSection
        scope="me"
        title="Your consent"
        description="Only you can see or change these. Giving consent records your agreement; the features that rely on it check for it before acting and stop when you revoke it."
        list={personal}
        canChange
      />
      {organization ? (
        <ConsentSection
          scope="organization"
          title="Organization policies"
          description={
            canManageOrganization
              ? "Policies that apply to the whole organization. Owners and admins set them."
              : "Policies that apply to the whole organization. Owners and admins set them; you can see them."
          }
          list={organization}
          canChange={canManageOrganization}
        />
      ) : null}
    </div>
  );
}

function ConsentSection({
  scope,
  title,
  description,
  list,
  canChange,
}: {
  readonly scope: "me" | "organization";
  readonly title: string;
  readonly description: string;
  readonly list: ConsentList;
  readonly canChange: boolean;
}) {
  const { run, messages } = useAction();
  const active = (p: ConsentPurposeInfo) =>
    list.records.filter((r) => r.purpose === p.purpose && r.status === "active");
  const titleOf = (r: ConsentRecord) =>
    list.purposes.find((p) => p.purpose === r.purpose)?.title ?? r.purpose;
  return (
    <Card title={title} description={`${description} Wording version ${list.policyVersion}.`}>
      <ul aria-label={title} className="mb-4 flex flex-col divide-y divide-border">
        {list.purposes.map((p) => {
          const current = active(p);
          return (
            <li key={p.purpose} className="flex flex-col gap-2 py-3" aria-label={p.title}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.title}</span>
                <Badge
                  label={current.length ? "given" : "not given"}
                  tone={current.length ? "positive" : "neutral"}
                />
              </div>
              <p className="text-sm text-fg-muted">{p.description}</p>
              {current.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span>
                    {r.scopeKey ? `${p.scopeKeyLabel ?? "Scope"}: ${r.scopeKey}. ` : ""}Given{" "}
                    {formatTime(r.grantedAt)}.
                  </span>
                  {canChange ? (
                    <ConfirmButton
                      action="consent.revoke"
                      label="Revoke"
                      confirmLabel="Confirm revoke"
                      onConfirm={() =>
                        void run(() => revokeConsentAction(scope, r.id), `${p.title}: revoked.`)
                      }
                    />
                  ) : null}
                </div>
              ))}
              {canChange && (p.scopeKeyLabel || current.length === 0) ? (
                <ClientForm
                  className="flex flex-col gap-2 sm:flex-row sm:items-end"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const key = String(new FormData(form).get("scopeKey") ?? "").trim();
                    void run(
                      () => giveConsentAction(scope, p.purpose, key),
                      `${p.title}: consent given.`,
                    ).then((ok) => ok && form.reset());
                  }}
                >
                  {p.scopeKeyLabel ? (
                    <div className="flex-1">
                      <TextField
                        id={`${scope}-${p.purpose}-scope`}
                        name="scopeKey"
                        label={p.scopeKeyLabel}
                        maxLength={200}
                        required
                      />
                    </div>
                  ) : null}
                  <div>
                    <Button action="consent.give" type="submit" size="sm">
                      Give consent
                    </Button>
                  </div>
                </ClientForm>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="mb-3 flex flex-col gap-2">{messages}</div>
      <DataTable
        caption={`${title}: history`}
        rowKey={(r) => r.id}
        rows={list.records}
        empty={<EmptyState title="No consent records yet" />}
        columns={[
          { key: "what", header: "Consent", cell: (r) => titleOf(r) },
          { key: "scope", header: "Scope", cell: (r) => r.scopeKey || "—" },
          {
            key: "status",
            header: "Status",
            cell: (r) => (
              <Badge label={r.status} tone={r.status === "active" ? "positive" : "neutral"} />
            ),
          },
          { key: "given", header: "Given", cell: (r) => formatTime(r.grantedAt), mono: true },
          {
            key: "revoked",
            header: "Revoked",
            cell: (r) => (r.revokedAt ? formatTime(r.revokedAt) : "—"),
            mono: true,
          },
        ]}
      />
    </Card>
  );
}
