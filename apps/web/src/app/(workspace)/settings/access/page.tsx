import { ErrorState, PageHeader } from "@originos/ui";
import type { Metadata } from "next";
import { AccessSettings } from "../../../../components/access-settings";
import {
  can,
  type AgentPermissions,
  type AgentRow,
  type GrantRow,
  type MyPermissions,
} from "../../../../lib/access-types";
import { apiFetch } from "../../../../lib/api";
import type { OrganizationDetail } from "../../../../lib/organization-types";
import { requireWorkspace } from "../../../../lib/session";

export const metadata: Metadata = { title: "Permissions and agents" };

export default async function AccessPage() {
  const { me } = await requireWorkspace();
  const [mine, agents, detail] = await Promise.all([
    apiFetch<MyPermissions>("/v1/me/permissions"),
    apiFetch<AgentRow[]>("/v1/organization/agents"),
    apiFetch<OrganizationDetail>("/v1/organization"),
  ]);
  if (!mine.ok || !agents.ok || !detail.ok) {
    const failed = [mine, agents, detail].find((r) => !r.ok);
    return (
      <>
        <PageHeader eyebrow="Settings" title="Permissions and agents" />
        <ErrorState title="Could not load permissions">
          {failed && !failed.ok ? failed.message : null}
        </ErrorState>
      </>
    );
  }
  const managesGrants = can(mine.data.permissions, "admin", "grants");
  const visibleAgents = agents.data.filter((a) => a.ownerUserId === me.user.id || managesGrants);
  const [grants, ...agentViews] = await Promise.all([
    managesGrants ? apiFetch<GrantRow[]>("/v1/organization/grants") : null,
    ...visibleAgents.map((a) =>
      apiFetch<AgentPermissions>(`/v1/organization/agents/${encodeURIComponent(a.id)}/permissions`),
    ),
  ]);
  const agentPermissions = Object.fromEntries(
    agentViews.flatMap((r) => (r?.ok ? [[r.data.agent.id, r.data]] : [])),
  );
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Permissions and agents"
        description="What you and your agents can do in this organization. The server checks every request against these rules, whatever this page shows."
      />
      <AccessSettings
        myUserId={me.user.id}
        mine={mine.data}
        agents={agents.data}
        agentPermissions={agentPermissions}
        grants={grants?.ok ? grants.data : null}
        members={detail.data.members}
      />
    </>
  );
}
