"use client";

import { Badge, Button, Card, DataTable, EmptyState, LoadingState, TextField } from "@originos/ui";
import { ClientForm } from "./client-form";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  listSessionsAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  type SessionSummary,
} from "../app/actions/account";
import { authClient, authErrorMessage } from "../lib/auth-client";
import type { Me } from "../lib/session-types";
import { FormMessage } from "./auth/auth-panel";

const formatTime = (iso: string | Date) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

type Status = { tone: "error" | "info"; text: string } | null;
const Message = ({ status }: { status: Status }) =>
  status ? <FormMessage tone={status.tone}>{status.text}</FormMessage> : null;

export function AccountSettings({
  me,
  passkeysAvailable,
}: {
  readonly me: Me;
  readonly passkeysAvailable: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Profile me={me} />
      <ChangePassword />
      <TwoFactor enabled={me.user.twoFactorEnabled} />
      {passkeysAvailable ? <Passkeys /> : null}
      <Sessions />
    </div>
  );
}

function Profile({ me }: { readonly me: Me }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    const { error } = await authClient.updateUser({ name });
    setStatus(
      error
        ? { tone: "error", text: authErrorMessage(error) }
        : { tone: "info", text: "Name saved." },
    );
    if (!error) router.refresh();
  };
  return (
    <Card
      title="Profile"
      description={`Email: ${me.user.email} (${me.user.emailVerified ? "verified" : "not verified"}).`}
    >
      <ClientForm
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => void onSubmit(e)}
      >
        <div className="flex-1">
          <TextField
            id="profile-name"
            name="name"
            label="Name"
            defaultValue={me.user.name}
            required
            maxLength={120}
          />
        </div>
        <Button action="account.save-name" type="submit">
          Save
        </Button>
      </ClientForm>
      <div className="mt-3">
        <Message status={status} />
      </div>
    </Card>
  );
}

function ChangePassword() {
  const [status, setStatus] = useState<Status>(null);
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const { error } = await authClient.changePassword({
      currentPassword: String(data.get("current") ?? ""),
      newPassword: String(data.get("next") ?? ""),
      revokeOtherSessions: data.get("revoke") === "on",
    });
    if (error) {
      setStatus({
        tone: "error",
        text:
          error.status === 400
            ? "The current password is wrong, or the new one is too short."
            : authErrorMessage(error),
      });
      return;
    }
    form.reset();
    setStatus({ tone: "info", text: "Password changed." });
  };
  return (
    <Card title="Password">
      <ClientForm className="flex flex-col gap-3" onSubmit={(e) => void onSubmit(e)}>
        <TextField
          id="pw-current"
          name="current"
          type="password"
          label="Current password"
          autoComplete="current-password"
          required
        />
        <TextField
          id="pw-next"
          name="next"
          type="password"
          label="New password"
          description="At least 12 characters."
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="revoke" defaultChecked className="size-4" /> Sign out my
          other sessions
        </label>
        <div>
          <Button action="account.change-password" type="submit">
            Change password
          </Button>
        </div>
        <Message status={status} />
      </ClientForm>
    </Card>
  );
}

/** Pulls the base32 secret out of an otpauth:// URI for manual entry. */
export function totpSecret(uri: string): string | null {
  try {
    return new URL(uri).searchParams.get("secret");
  } catch {
    return null;
  }
}

function TwoFactor({ enabled }: { readonly enabled: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [setup, setSetup] = useState<{ uri: string; backupCodes: string[] } | null>(null);

  const start = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const { data, error } = await authClient.twoFactor.enable({ password });
    if (error || !data || data.method !== "totp") {
      setStatus({
        tone: "error",
        text: error?.status === 400 ? "That password is wrong." : authErrorMessage(error),
      });
      return;
    }
    setStatus(null);
    setSetup({ uri: data.totpURI, backupCodes: data.backupCodes });
  };
  const confirm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s+/g, "");
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    if (error) {
      setStatus({
        tone: "error",
        text: "That code didn't work. Check the time on your device and try again.",
      });
      return;
    }
    setSetup(null);
    setStatus({ tone: "info", text: "Two-step verification is on." });
    router.refresh();
  };
  const disable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const { error } = await authClient.twoFactor.disable({ password });
    if (error) {
      setStatus({
        tone: "error",
        text: error.status === 400 ? "That password is wrong." : authErrorMessage(error),
      });
      return;
    }
    setStatus({ tone: "info", text: "Two-step verification is off." });
    router.refresh();
  };

  return (
    <Card
      title="Two-step verification"
      description="Ask for a code from an authenticator app (TOTP) after your password."
      actions={
        <Badge
          label={enabled ? "On" : "Off"}
          tone={enabled ? "positive" : "neutral"}
          icon={ShieldCheck}
        />
      }
    >
      {setup ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Add OriginOS to your authenticator app with this key, or{" "}
            <a className="font-medium text-accent-text underline" href={setup.uri}>
              open it in an authenticator app
            </a>
            .
          </p>
          <p
            className="break-all rounded-md bg-surface-alt px-3 py-2 font-mono text-sm"
            data-testid="totp-secret"
          >
            {totpSecret(setup.uri)}
          </p>
          <div>
            <p className="text-sm font-medium">Backup codes</p>
            <p className="text-sm text-fg-muted">
              Each works once if you lose your device. Store them somewhere safe now; they are not
              shown again.
            </p>
            <ul
              className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm"
              data-testid="backup-codes"
            >
              {setup.backupCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <ClientForm
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => void confirm(e)}
          >
            <div className="flex-1">
              <TextField
                id="totp-confirm"
                name="code"
                label="Code from your app"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            </div>
            <Button action="account.2fa-confirm" type="submit" variant="primary">
              Turn on
            </Button>
          </ClientForm>
        </div>
      ) : (
        <ClientForm
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => void (enabled ? disable(e) : start(e))}
        >
          <div className="flex-1">
            <TextField
              id="twofa-password"
              name="password"
              type="password"
              label="Confirm with your password"
              autoComplete="current-password"
              required
            />
          </div>
          <Button
            action={enabled ? "account.2fa-disable" : "account.2fa-start"}
            type="submit"
            variant={enabled ? "danger" : "primary"}
          >
            {enabled ? "Turn off" : "Set up"}
          </Button>
        </ClientForm>
      )}
      <div className="mt-3">
        <Message status={status} />
      </div>
    </Card>
  );
}

function Passkeys() {
  const { data, isPending, refetch } = authClient.useListPasskeys();
  const [status, setStatus] = useState<Status>(null);
  const add = async () => {
    const result = await authClient.passkey.addPasskey({
      name: `Passkey ${new Date().toLocaleDateString()}`,
    });
    if (result?.error) {
      setStatus({ tone: "error", text: authErrorMessage(result.error) });
      return;
    }
    setStatus({ tone: "info", text: "Passkey added. You can now sign in with it." });
    void refetch();
  };
  const remove = async (id: string) => {
    const { error } = await authClient.passkey.deletePasskey({ id });
    setStatus(
      error
        ? { tone: "error", text: authErrorMessage(error) }
        : { tone: "info", text: "Passkey removed." },
    );
    void refetch();
  };
  return (
    <Card
      title="Passkeys"
      description="Sign in with your device's screen lock or a security key instead of a password."
      actions={
        <Button action="account.passkey-add" onClick={() => void add()} icon={KeyRound} size="sm">
          Add a passkey
        </Button>
      }
    >
      {isPending ? (
        <LoadingState label="Loading passkeys" />
      ) : (
        <DataTable
          caption="Your passkeys"
          captionHidden
          rowKey={(p) => p.id}
          rows={data ?? []}
          empty={<EmptyState title="No passkeys yet" />}
          columns={[
            { key: "name", header: "Name", cell: (p) => p.name ?? "Passkey" },
            { key: "added", header: "Added", cell: (p) => formatTime(p.createdAt), mono: true },
            {
              key: "actions",
              header: "Actions",
              align: "end",
              cell: (p) => (
                <Button
                  action="account.passkey-remove"
                  size="sm"
                  variant="ghost"
                  onClick={() => void remove(p.id)}
                >
                  Remove
                </Button>
              ),
            },
          ]}
        />
      )}
      <div className="mt-3">
        <Message status={status} />
      </div>
    </Card>
  );
}

function Sessions() {
  const [rows, setRows] = useState<SessionSummary[] | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [version, setVersion] = useState(0);
  const load = () => setVersion((v) => v + 1);
  useEffect(() => {
    let cancelled = false;
    void listSessionsAction().then((result) => {
      if (cancelled) return;
      if (result.ok) setRows(result.data);
      else setStatus({ tone: "error", text: result.message });
    });
    return () => {
      cancelled = true;
    };
  }, [version]);
  const revoke = async (id: string) => {
    const result = await revokeSessionAction(id);
    setStatus(
      result.ok
        ? { tone: "info", text: "Session signed out." }
        : { tone: "error", text: result.message },
    );
    load();
  };
  const revokeOthers = async () => {
    const result = await revokeOtherSessionsAction();
    setStatus(
      result.ok
        ? { tone: "info", text: "All other sessions signed out." }
        : { tone: "error", text: result.message },
    );
    load();
  };
  return (
    <Card
      title="Sessions"
      description="Browsers signed in to your account. Sessions last 7 days and renew while you use them."
      actions={
        <Button
          action="account.sessions-revoke-others"
          size="sm"
          onClick={() => void revokeOthers()}
        >
          Sign out other sessions
        </Button>
      }
    >
      {rows === null ? (
        <LoadingState label="Loading sessions" />
      ) : (
        <DataTable
          caption="Your sessions"
          captionHidden
          rowKey={(s) => s.id}
          rows={rows}
          empty={<EmptyState title="No active sessions" />}
          columns={[
            {
              key: "device",
              header: "Browser",
              cell: (s) => (
                <span className="block max-w-xs truncate" title={s.userAgent ?? undefined}>
                  {s.userAgent ?? "Unknown browser"}
                  {s.current ? <Badge className="ml-2" label="This browser" tone="accent" /> : null}
                </span>
              ),
            },
            { key: "ip", header: "IP address", cell: (s) => s.ipAddress ?? "Unknown", mono: true },
            {
              key: "started",
              header: "Signed in",
              cell: (s) => formatTime(s.createdAt),
              mono: true,
            },
            {
              key: "actions",
              header: "Actions",
              align: "end",
              cell: (s) =>
                s.current ? null : (
                  <Button
                    action="account.session-revoke"
                    size="sm"
                    variant="ghost"
                    onClick={() => void revoke(s.id)}
                  >
                    Sign out
                  </Button>
                ),
            },
          ]}
        />
      )}
      <div className="mt-3">
        <Message status={status} />
      </div>
    </Card>
  );
}
