import { Button, ErrorState } from "@originos/ui";
import type { Metadata } from "next";
import { OrganizationSettings } from "../../../components/organization-settings";
import { SectionPage } from "../../../components/section-page";
import { SystemStatus } from "../../../components/system-status";
import { can, type MyPermissions } from "../../../lib/access-types";
import { apiFetch } from "../../../lib/api";
import { getAuthConfig } from "../../../lib/auth-config";
import { getSection } from "../../../lib/navigation";
import type {
  AuditEventRow,
  InvitationRow,
  OrganizationDetail,
} from "../../../lib/organization-types";
import { requireWorkspace } from "../../../lib/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { me } = await requireWorkspace();
  const mine = await apiFetch<MyPermissions>("/v1/me/permissions");
  const permissions = mine.ok ? mine.data.permissions : null;
  const [detail, invitations, audit, config] = await Promise.all([
    apiFetch<OrganizationDetail>("/v1/organization"),
    can(permissions, "read", "invitations")
      ? apiFetch<InvitationRow[]>("/v1/organization/invitations")
      : null,
    can(permissions, "read", "audit_log")
      ? apiFetch<AuditEventRow[]>("/v1/organization/audit-events")
      : null,
    getAuthConfig(),
  ]);
  return (
    <SectionPage section={getSection("settings")}>
      <div className="mb-6 flex flex-wrap gap-3">
        <Button action="settings.account" href="/settings/account">
          Your account and security
        </Button>
        <Button action="settings.access" href="/settings/access">
          Permissions and agents
        </Button>
        <Button action="settings.consent" href="/settings/consent">
          Consent
        </Button>
        <Button action="settings.files" href="/settings/files">
          Files
        </Button>
        {can(permissions, "read", "jobs") ? (
          <Button action="settings.jobs" href="/settings/jobs">
            Background jobs
          </Button>
        ) : null}
      </div>
      <div className="mb-10">
        {detail.ok ? (
          <OrganizationSettings
            detail={detail.data}
            myUserId={me.user.id}
            invitations={invitations?.ok ? invitations.data : null}
            auditEvents={audit?.ok ? audit.data : null}
            emailConfigured={config.emailDelivery === "configured"}
            permissions={permissions}
          />
        ) : (
          <ErrorState title="Could not load this organization">{detail.message}</ErrorState>
        )}
      </div>
      <div className="mb-10">
        <SystemStatus />
      </div>
    </SectionPage>
  );
}
