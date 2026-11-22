import { ErrorState, PageHeader } from "@originos/ui";
import type { Metadata } from "next";
import { ConsentSettings } from "../../../../components/consent-settings";
import { can, type ConsentList, type MyPermissions } from "../../../../lib/access-types";
import { apiFetch } from "../../../../lib/api";
import { requireWorkspace } from "../../../../lib/session";

export const metadata: Metadata = { title: "Consent" };

export default async function ConsentPage() {
  await requireWorkspace();
  const [mine, personal, organization] = await Promise.all([
    apiFetch<MyPermissions>("/v1/me/permissions"),
    apiFetch<ConsentList>("/v1/me/consents"),
    apiFetch<ConsentList>("/v1/organization/consents"),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Consent"
        description="What you, and this organization, have agreed to. Every record keeps its history; revoking takes effect immediately."
      />
      {personal.ok ? (
        <ConsentSettings
          personal={personal.data}
          organization={organization.ok ? organization.data : null}
          canManageOrganization={mine.ok && can(mine.data.permissions, "write", "consents")}
        />
      ) : (
        <ErrorState title="Could not load consent records">{personal.message}</ErrorState>
      )}
    </>
  );
}
