"use client";

import {
  Badge,
  Button,
  Card,
  Checkbox,
  DataTable,
  EmptyState,
  SelectField,
  TextField,
} from "@originos/ui";
import { useState, type FormEvent } from "react";
import {
  createAgentAction,
  createGrantAction,
  disableAgentAction,
  revokeGrantAction,
} from "../app/actions/access";
import {
  ACTIONS,
  RESOURCE_LABELS,
  RESOURCE_TYPES,
  type Action,
  type AgentPermissions,
  type AgentRow,
  type GrantRow,
  type MyPermissions,
  type PermissionMatrix,
  type ResourceType,
} from "../lib/access-types";
import type { OrganizationDetail } from "../lib/organization-types";
import { ClientForm } from "./client-form";
import { ConfirmButton, useAction } from "./action-helpers";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

/** "Organization: read · Members: read", or "Nothing" for an empty matrix. */
export function summarize(m: PermissionMatrix): string {
  const parts = RESOURCE_TYPES.filter((t) => m[t].length > 0).map(
    (t) => `${RESOURCE_LABELS[t]}: ${m[t].join(", ")}`,
  );
  return parts.length ? parts.join(" · ") : "Nothing";
}

export function AccessSettings({
  myUserId,
  mine,
  agents,
  agentPermissions,
  grants,
  members,
}: {
  readonly myUserId: string;
  readonly mine: MyPermissions;
  readonly agents: readonly AgentRow[];
  readonly agentPermissions: Readonly<Record<string, AgentPermissions>>;
  readonly grants: readonly GrantRow[] | null;
  readonly members: OrganizationDetail["members"];
}) {
  return (
    <div className="flex flex-col gap-6">
      <MyAccess mine={mine} />
      <Agents agents={agents} agentPermissions={agentPermissions} />
      {grants ? (
        <Grants rows={grants} members={members} agents={agents} myUserId={myUserId} />
      ) : null}
    </div>
  );
}

function MyAccess({ mine }: { readonly mine: MyPermissions }) {
  const rows = RESOURCE_TYPES.map((type) => ({ type, actions: mine.permissions[type] }));
  return (
    <Card
      title="Your permissions"
      description={`From your role (${mine.role}) plus any grants or denies below. A deny always wins.`}
    >
      <DataTable
        caption="Your effective permissions"
        captionHidden
        rowKey={(r) => r.type}
        rows={rows}
        empty={<EmptyState title="No permissions" />}
        columns={[
          { key: "resource", header: "Resource", cell: (r) => RESOURCE_LABELS[r.type] },
          {
            key: "actions",
            header: "You can",
            cell: (r) => (r.actions.length ? r.actions.join(", ") : "Nothing"),
          },
        ]}
      />
      {mine.grants.length > 0 ? (
        <p className="mt-3 text-sm text-fg-muted">
          {mine.grants.filter((g) => g.status === "active").length} active grant or deny entries
          apply to you.
        </p>
      ) : null}
    </Card>
  );
}

function Agents({
  agents,
  agentPermissions,
}: {
  readonly agents: readonly AgentRow[];
  readonly agentPermissions: Readonly<Record<string, AgentPermissions>>;
}) {
  const { run, messages } = useAction();
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    if (await run(() => createAgentAction(name, description), `Registered ${name}.`)) form.reset();
  };
  return (
    <Card
      title="Agents"
      description="Agents act for the person who registered them and can never do more than that person. A new agent can only read the organization until an owner or admin grants it more. Agents cannot sign in yet: connecting them arrives with AgentTrust."
    >
      <ClientForm
        className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => void onSubmit(e)}
      >
        <div className="flex-1">
          <TextField
            id="agent-name"
            name="name"
            label="Agent name"
            minLength={2}
            maxLength={80}
            required
          />
        </div>
        <div className="flex-1">
          <TextField
            id="agent-description"
            name="description"
            label="What it does"
            maxLength={280}
          />
        </div>
        <Button action="agent.create" type="submit" variant="primary">
          Register agent
        </Button>
      </ClientForm>
      <div className="mb-3 flex flex-col gap-2">{messages}</div>
      <DataTable
        caption="Agents in this organization"
        captionHidden
        rowKey={(a) => a.id}
        rows={agents}
        empty={<EmptyState title="No agents registered" />}
        columns={[
          {
            key: "name",
            header: "Agent",
            cell: (a) => (
              <span>
                <span className="block font-medium">{a.name}</span>
                {a.description ? (
                  <span className="block text-xs text-fg-muted">{a.description}</span>
                ) : null}
              </span>
            ),
          },
          { key: "owner", header: "Owner", cell: (a) => a.ownerName },
          {
            key: "status",
            header: "Status",
            cell: (a) => (
              <Badge label={a.status} tone={a.status === "active" ? "positive" : "neutral"} />
            ),
          },
          {
            key: "can",
            header: "Can do",
            cell: (a) => {
              const view = agentPermissions[a.id];
              return view ? (
                <span className="text-sm">{summarize(view.permissions)}</span>
              ) : (
                <span className="text-xs text-fg-muted">Visible to its owner and admins</span>
              );
            },
          },
          {
            key: "actions",
            header: "Actions",
            align: "end",
            cell: (a) =>
              a.canManage && a.status === "active" ? (
                <ConfirmButton
                  action="agent.disable"
                  label="Disable"
                  confirmLabel="Confirm disable"
                  onConfirm={() =>
                    void run(() => disableAgentAction(a.id), `${a.name} is disabled.`)
                  }
                />
              ) : null,
          },
        ]}
      />
    </Card>
  );
}

const grantTone = { active: "positive", revoked: "neutral", expired: "warning" } as const;

function Grants({
  rows,
  members,
  agents,
  myUserId,
}: {
  readonly rows: readonly GrantRow[];
  readonly members: OrganizationDetail["members"];
  readonly agents: readonly AgentRow[];
  readonly myUserId: string;
}) {
  const { run, messages } = useAction();
  const [effect, setEffect] = useState<"allow" | "deny">("deny");
  const subjects = [
    ...members
      .filter((m) => m.userId !== myUserId)
      .map((m) => ({ value: `user:${m.userId}`, label: `${m.name} (${m.role})` })),
    ...agents
      .filter((a) => a.status === "active")
      .map((a) => ({ value: `agent:${a.id}`, label: `${a.name} (agent of ${a.ownerName})` })),
  ];
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const [subjectType, subjectId] = String(data.get("subject") ?? "").split(":");
    const actions = ACTIONS.filter((a) => data.get(`action-${a}`) === "on");
    const ok = await run(
      () =>
        createGrantAction({
          subjectType: subjectType === "agent" ? "agent" : "user",
          subjectId: subjectId ?? "",
          effect,
          resourceType: String(data.get("resourceType")) as ResourceType | "*",
          actions: actions as Action[],
          reason: String(data.get("reason") ?? "").trim(),
        }),
      effect === "deny" ? "Deny added." : "Grant added.",
    );
    if (ok) form.reset();
  };
  return (
    <Card
      title="Grants and denies"
      description="Fine-grained changes on top of roles. A deny blocks an action even when the role allows it; nobody can deny the owner, lift a deny on themselves, or grant what they do not hold. People can be granted extra access to the audit log only; change their role for anything more."
    >
      {subjects.length === 0 ? (
        <p className="mb-4 text-sm text-fg-muted">
          Invite a member or register an agent to give them grants.
        </p>
      ) : (
        <ClientForm className="mb-4 flex flex-col gap-3" onSubmit={(e) => void onSubmit(e)}>
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField id="grant-subject" name="subject" label="Who" options={subjects} />
            <SelectField
              id="grant-effect"
              name="effect"
              label="Effect"
              value={effect}
              onChange={(e) => setEffect(e.target.value === "allow" ? "allow" : "deny")}
              options={[
                { value: "deny", label: "Deny" },
                { value: "allow", label: "Allow" },
              ]}
            />
            <SelectField
              id="grant-resource"
              name="resourceType"
              label="Resource"
              defaultValue="audit_log"
              options={[...RESOURCE_TYPES, "*" as const].map((t) => ({
                value: t,
                label: RESOURCE_LABELS[t],
              }))}
            />
          </div>
          <fieldset className="flex flex-wrap gap-4">
            <legend className="mb-1 text-sm font-medium">Actions</legend>
            {ACTIONS.map((a) => (
              <Checkbox key={a} id={`grant-action-${a}`} name={`action-${a}`} label={a} />
            ))}
          </fieldset>
          <TextField id="grant-reason" name="reason" label="Reason" maxLength={280} />
          <div>
            <Button action="grant.create" type="submit" variant="primary">
              {effect === "deny" ? "Add deny" : "Add grant"}
            </Button>
          </div>
        </ClientForm>
      )}
      <div className="mb-3 flex flex-col gap-2">{messages}</div>
      <DataTable
        caption="Grants and denies"
        captionHidden
        rowKey={(g) => g.id}
        rows={rows}
        empty={<EmptyState title="No grants or denies" />}
        columns={[
          {
            key: "who",
            header: "Who",
            cell: (g) => (
              <span>
                {g.subjectName ?? g.subjectId}
                {g.subjectType === "agent" ? <span className="text-fg-muted"> (agent)</span> : null}
              </span>
            ),
          },
          {
            key: "rule",
            header: "Rule",
            cell: (g) => (
              <span>
                <Badge label={g.effect} tone={g.effect === "deny" ? "negative" : "info"} />{" "}
                {g.actions.join(", ")} on {RESOURCE_LABELS[g.resourceType]}
                {g.reason ? <span className="block text-xs text-fg-muted">{g.reason}</span> : null}
              </span>
            ),
          },
          {
            key: "status",
            header: "Status",
            cell: (g) => <Badge label={g.status} tone={grantTone[g.status]} />,
          },
          { key: "created", header: "Added", cell: (g) => formatDate(g.createdAt), mono: true },
          {
            key: "actions",
            header: "Actions",
            align: "end",
            cell: (g) =>
              g.status === "active" && !(g.subjectType === "user" && g.subjectId === myUserId) ? (
                <ConfirmButton
                  action="grant.revoke"
                  label="Revoke"
                  confirmLabel="Confirm revoke"
                  onConfirm={() => void run(() => revokeGrantAction(g.id), "Revoked.")}
                />
              ) : null,
          },
        ]}
      />
    </Card>
  );
}
