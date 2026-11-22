import { AppShell, StatusBadge, type StatusTone } from "@originos/ui";
import { type ApiStatus, fetchApiStatus } from "../lib/api-status";
import { loadWebServerEnv } from "../lib/env";

export const dynamic = "force-dynamic";

const MODULES = [
  "AgentTrust",
  "PublisherOS",
  "EvidenceGraph",
  "OriginGraph",
  "IdentityMesh",
  "CreatorRights",
  "Verified Human",
  "Origin Studio",
  "Origin Library",
  "Origin Intelligence",
  "Origin Automations",
  "Origin Registry",
  "Origin Analytics",
  "Origin Connect",
  "Origin Marketplace",
] as const;

function describeApi(status: ApiStatus): { label: string; tone: StatusTone; detail: string } {
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

export default async function HomePage() {
  const env = loadWebServerEnv();
  const status = await fetchApiStatus(env.ORIGINOS_API_URL);
  const api = describeApi(status);
  const checks = "health" in status ? Object.entries(status.health.checks) : [];

  return (
    <AppShell
      productName="OriginOS"
      tagline="Development build"
      footer={
        <p>Phase 01 scaffold. Statuses on this page are read live from the running services.</p>
      }
    >
      <h1>OriginOS</h1>
      <p className="lede">
        One platform for verified creator identity, content provenance, AI-agent accountability and
        scientific evidence. This build contains the platform scaffold only; no product module is
        usable yet.
      </p>

      <section aria-labelledby="system-status">
        <h2 id="system-status">System status</h2>
        <dl className="status-list">
          <div>
            <dt>API</dt>
            <dd>
              <StatusBadge label={api.label} tone={api.tone} /> <span>{api.detail}</span>
            </dd>
          </div>
          {checks.map(([name, check]) => (
            <div key={name}>
              <dt>{name === "database" ? "Database" : name}</dt>
              <dd>
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
                {check.detail ? <span> {check.detail}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="modules">
        <h2 id="modules">Modules</h2>
        <p>Each module is listed with its true build status. None has been built yet.</p>
        <ul className="module-list">
          {MODULES.map((name) => (
            <li key={name}>
              <span>{name}</span> <StatusBadge label="Not built" tone="neutral" />
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
