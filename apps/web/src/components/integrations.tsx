"use client";

import type { ConnectionStatus, ConnectionView, ProviderView } from "@originos/contracts";
import { Badge, type BadgeTone, Button, Card, DataTable, EmptyState } from "@originos/ui";
import { useState } from "react";
import {
  checkConnectionAction,
  disconnectAction,
  startConnectAction,
} from "../app/actions/connect";
import { ConfirmButton, useAction } from "./action-helpers";
import { FormMessage } from "./auth/auth-panel";

const STATUS: Record<ConnectionStatus, { label: string; tone: BadgeTone }> = {
  connected: { label: "connected", tone: "positive" },
  degraded: { label: "needs attention", tone: "warning" },
  revoked: { label: "disconnected", tone: "neutral" },
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function Integrations({
  providers,
  connections,
  canManage,
}: {
  readonly providers: readonly ProviderView[];
  readonly connections: readonly ConnectionView[];
  readonly canManage: boolean;
}) {
  const { run, messages } = useAction();
  const names = Object.fromEntries(providers.map((p) => [p.id, p.name]));
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {providers.map((p) => (
          <ProviderCard key={p.id} provider={p} canManage={canManage} />
        ))}
      </div>

      <Card
        title="Connections"
        description="Accounts this organization has connected. Disconnecting stops OriginOS from making any new call with that account at once, then revokes the grant at the provider and erases the stored tokens."
      >
        <div className="mb-3 flex flex-col gap-2" aria-live="polite">
          {messages}
        </div>
        <DataTable
          caption="Connected accounts"
          captionHidden
          rowKey={(c) => c.id}
          rows={connections}
          empty={
            <EmptyState title="No connections yet">
              {canManage
                ? "Connect a provider above to link an account."
                : "Owners and admins can connect providers."}
            </EmptyState>
          }
          columns={[
            {
              key: "account",
              header: "Account",
              cell: (c) => (
                <div className="flex flex-col">
                  <span className="font-medium">{c.accountLabel ?? "Unknown account"}</span>
                  <span className="text-xs text-fg-muted">
                    {names[c.provider] ?? c.provider} · connected by{" "}
                    {c.connectedBy.name ?? "a former member"} · {formatTime(c.createdAt)}
                  </span>
                </div>
              ),
            },
            {
              key: "status",
              header: "Status",
              cell: (c) => (
                <div className="flex flex-col gap-1">
                  <span>
                    <Badge label={STATUS[c.status].label} tone={STATUS[c.status].tone} />
                  </span>
                  {c.lastError ? (
                    <span className="text-sm text-fg-muted">{c.lastError}</span>
                  ) : null}
                  {c.lastCheckedAt && c.status !== "revoked" ? (
                    <span className="text-xs text-fg-muted">
                      Last checked {formatTime(c.lastCheckedAt)}
                    </span>
                  ) : null}
                  {c.revokedAt ? (
                    <span className="text-xs text-fg-muted">
                      Disconnected {formatTime(c.revokedAt)}
                    </span>
                  ) : null}
                </div>
              ),
            },
            {
              key: "scopes",
              header: "Granted permissions",
              mono: true,
              cell: (c) => (c.grantedScopes.length ? c.grantedScopes.join(" ") : "none"),
            },
            {
              key: "webhook",
              header: "Webhook URL",
              cell: (c) =>
                c.webhookUrl ? (
                  <code className="text-xs break-all">{c.webhookUrl}</code>
                ) : (
                  <span className="text-sm text-fg-muted">
                    {c.status === "revoked" ? "—" : "Not available"}
                  </span>
                ),
            },
            {
              key: "actions",
              header: "Actions",
              align: "end",
              cell: (c) =>
                canManage && c.status !== "revoked" ? (
                  <span className="inline-flex flex-wrap justify-end gap-2">
                    <Button
                      action="integration.check"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void run(
                          () => checkConnectionAction(c.id),
                          `Checking ${c.accountLabel ?? "the connection"}. The status updates when the check finishes.`,
                        )
                      }
                    >
                      Check connection
                    </Button>
                    <ConfirmButton
                      action="integration.disconnect"
                      label="Disconnect"
                      confirmLabel="Confirm disconnect"
                      onConfirm={() =>
                        void run(
                          () => disconnectAction(c.id),
                          `${c.accountLabel ?? "The account"} is disconnected. OriginOS makes no new calls with it.`,
                        )
                      }
                    />
                  </span>
                ) : (
                  <span className="text-sm text-fg-muted">—</span>
                ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

function ProviderCard({
  provider: p,
  canManage,
}: {
  readonly provider: ProviderView;
  readonly canManage: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true);
    setError(null);
    const result = await startConnectAction(p.id);
    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      return;
    }
    const to = new URL(result.data.authorizeUrl);
    if (to.protocol !== "https:" && to.protocol !== "http:") {
      setBusy(false);
      setError("The provider address is not valid.");
      return;
    }
    window.location.assign(to.toString());
  };
  return (
    <Card
      title={p.name}
      description={p.description}
      actions={
        <span className="flex flex-wrap gap-2">
          {p.testOnly ? <Badge label="local testing only" tone="warning" /> : null}
          <Badge
            label={p.configured ? "available" : "not set up"}
            tone={p.configured ? "positive" : "neutral"}
          />
        </span>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        {!p.configured && p.setupHint ? (
          <p className="text-fg-muted">
            {p.name} is not set up for this deployment. {p.setupHint}
          </p>
        ) : null}
        <div>
          <h3 className="font-medium">Permissions OriginOS asks for</h3>
          <ul className="mt-1 list-disc pl-5">
            {p.scopes.map((s) => (
              <li key={s.scope}>
                <code className="text-xs">{s.scope}</code>: {s.disclosure}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-medium">What OriginOS does with it</h3>
          <ul className="mt-1 list-disc pl-5">
            {p.capabilities.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-medium">Where data lives</h3>
          <p className="mt-1 text-fg-muted">{p.dataResidency}</p>
          <p className="mt-1 text-fg-muted">{p.stored}</p>
        </div>
        {canManage && p.configured ? (
          <div>
            <Button action="integration.connect" onClick={() => void connect()}>
              {busy ? "Opening…" : `Connect ${p.name}`}
            </Button>
          </div>
        ) : null}
        {!canManage ? (
          <p className="text-fg-muted">Only owners and admins can connect providers.</p>
        ) : null}
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      </div>
    </Card>
  );
}
