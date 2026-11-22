import "server-only";
import { CORRELATION_ID_HEADER } from "@originos/contracts";
import { Card, StatusBadge, type StatusTone } from "@originos/ui";
import { headers } from "next/headers";
import { type ApiStatus, fetchApiStatus } from "../lib/api-status";
import { loadWebServerEnv } from "../lib/env";
import { logEvent } from "../lib/log";

export function describeApi(status: ApiStatus): {
  label: string;
  tone: StatusTone;
  detail: string;
} {
  switch (status.kind) {
    case "ready":
      return {
        label: "Ready",
        tone: "positive",
        detail: `API ${status.health.version} answered its readiness check.`,
      };
    case "not_ready":
      return {
        label: "Not ready",
        tone: "negative",
        detail: "The API answered, but a configured dependency failed.",
      };
    case "unreachable":
      return {
        label: "Unreachable",
        tone: "negative",
        detail: "The API did not answer. Start it with pnpm dev.",
      };
    case "invalid_response":
      return {
        label: "Unexpected response",
        tone: "negative",
        detail: "Something answered, but not with the OriginOS health contract.",
      };
  }
}

const DEPENDENCY_LABELS = {
  ok: "OK",
  not_configured: "Not configured",
  unreachable: "Unreachable",
  error: "Error",
} as const;

/** Live readiness read from the API on every request; never cached or invented. */
export async function SystemStatus({ headingLevel = 2 }: { readonly headingLevel?: 2 | 3 }) {
  const env = loadWebServerEnv();
  const correlationId = (await headers()).get(CORRELATION_ID_HEADER) ?? undefined;
  const status = await fetchApiStatus(env.ORIGINOS_API_URL, { correlationId });
  if (status.kind !== "ready") {
    logEvent("warn", "API readiness check did not pass", { correlationId, apiStatus: status.kind });
  }
  const api = describeApi(status);
  const checks = "health" in status ? Object.entries(status.health.checks) : [];

  return (
    <Card
      title="System status"
      description="Read live from the running services on each page load."
      headingLevel={headingLevel}
    >
      <dl className="flex flex-col gap-3 text-sm" data-testid="system-status">
        <div className="flex flex-wrap items-center gap-2">
          <dt className="w-24 font-medium">API</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <StatusBadge label={api.label} tone={api.tone} />
            <span className="text-fg-muted">{api.detail}</span>
          </dd>
        </div>
        {checks.map(([name, check]) => (
          <div key={name} className="flex flex-wrap items-center gap-2">
            <dt className="w-24 font-medium">{name === "database" ? "Database" : name}</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={DEPENDENCY_LABELS[check.status]}
                tone={
                  check.status === "ok"
                    ? "positive"
                    : check.status === "not_configured"
                      ? "neutral"
                      : "negative"
                }
              />
              {check.detail ? <span className="text-fg-muted">{check.detail}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
