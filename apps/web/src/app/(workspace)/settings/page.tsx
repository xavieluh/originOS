import { Button, ErrorState } from "@originos/ui";
import type { Metadata } from "next";
import { OrganizationSettings } from "../../../components/organization-settings";
import { SectionPage } from "../../../components/section-page";
import { SystemStatus } from "../../../components/system-status";
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
  const { me, active } = await requireWorkspace();
  const manage = active.role === "owner" || active.role === "admin";
  const [detail, invitations, audit, config] = await Promise.all([
    apiFetch<OrganizationDetail>("/v1/organization"),
    manage ? apiFetch<InvitationRow[]>("/v1/organization/invitations") : null,
    manage ? apiFetch<AuditEventRow[]>("/v1/organization/audit-events") : null,
    getAuthConfig(),
  ]);
  return (
    <SectionPage section={getSection("settings")}>
      <div className="mb-6 flex flex-wrap gap-3">
        <Button action="settings.account" href="/settings/account">
          Your account and security
        </Button>
      </div>
      <div className="mb-10">
        {detail.ok ? (
          <OrganizationSettings
            detail={detail.data}
            myUserId={me.user.id}
            invitations={invitations?.ok ? invitations.data : null}
            auditEvents={audit?.ok ? audit.data : null}
            emailConfigured={config.emailDelivery === "configured"}
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
