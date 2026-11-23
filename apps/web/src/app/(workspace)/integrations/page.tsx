import type { ConnectionView, ProviderView } from "@originos/contracts";
import { ErrorState } from "@originos/ui";
import type { Metadata } from "next";
import { FormMessage } from "../../../components/auth/auth-panel";
import { Integrations } from "../../../components/integrations";
import { SectionPage } from "../../../components/section-page";
import { can, type MyPermissions } from "../../../lib/access-types";
import { apiFetch } from "../../../lib/api";
import { getSection } from "../../../lib/navigation";
import { requireWorkspace } from "../../../lib/session";

export const metadata: Metadata = { title: "Integrations" };

/** Outcomes the callback route reports. Only these known codes are shown; nothing from the URL is echoed. */
const OUTCOMES: Record<string, string> = {
  denied: "The connection was not approved at the provider. Nothing was connected.",
  state_used: "That connection attempt was already used. Start connecting again.",
  state_expired: "That connection attempt expired. Start connecting again.",
  invalid_state:
    "That connection attempt is not valid here: it was started by someone else or in another organization. Start connecting again.",
  provider_rejected_code: "The provider did not accept the authorization. Start connecting again.",
  provider_error: "The provider could not complete the connection. Try again.",
  provider_not_configured: "That provider is not set up for this deployment.",
  forbidden: "Only owners and admins can connect providers.",
  api_unreachable: "OriginOS did not answer while finishing the connection. Try again.",
};

export default async function IntegrationsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  await requireWorkspace();
  const query = await searchParams;
  const [mine, providers, connections] = await Promise.all([
    apiFetch<MyPermissions>("/v1/me/permissions"),
    apiFetch<ProviderView[]>("/v1/connect/providers"),
    apiFetch<ConnectionView[]>("/v1/organization/connections"),
  ]);
  const connectedName =
    providers.ok && query.connected
      ? providers.data.find((p) => p.id === query.connected)?.name
      : undefined;
  const failed = [providers, connections].find((r) => !r.ok);
  return (
    <SectionPage section={getSection("integrations")}>
      <div className="mb-8 flex flex-col gap-4">
        {connectedName ? (
          <FormMessage tone="info">{connectedName} is connected.</FormMessage>
        ) : null}
        {query.error ? (
          <FormMessage tone="error">
            {OUTCOMES[query.error] ?? "The connection could not be completed. Try again."}
          </FormMessage>
        ) : null}
        {providers.ok && connections.ok ? (
          <Integrations
            providers={providers.data}
            connections={connections.data}
            canManage={mine.ok && can(mine.data.permissions, "admin", "integrations")}
          />
        ) : (
          <ErrorState title="Could not load integrations">
            {failed && !failed.ok ? failed.message : null}
          </ErrorState>
        )}
      </div>
    </SectionPage>
  );
}
