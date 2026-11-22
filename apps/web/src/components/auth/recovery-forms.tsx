"use client";

import { Button, TextField } from "@originos/ui";
import { ClientForm } from "../client-form";
import { navigateAfterAuthChange } from "../../lib/navigate";
import { useState, type FormEvent } from "react";
import { authClient, authErrorMessage } from "../../lib/auth-client";
import { FormMessage } from "./auth-panel";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    const { error: err } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    if (err) setError(authErrorMessage(err));
    else setSent(true);
  };
  if (sent) {
    // Same answer whether or not the account exists, so this form cannot be used to find accounts.
    return (
      <FormMessage tone="info">
        If an account uses that address, a reset link is on its way. It expires in 1 hour.
      </FormMessage>
    );
  }
  return (
    <ClientForm className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
      <TextField id="email" name="email" type="email" label="Email" autoComplete="email" required />
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <Button action="auth.request-reset" type="submit" variant="primary">
        Email me a reset link
      </Button>
    </ClientForm>
  );
}

export function ResetPasswordForm({ token }: { readonly token: string }) {
  const [error, setError] = useState<string | null>(null);
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("password") ?? "");
    if (newPassword !== String(form.get("confirm") ?? "")) {
      setError("The two passwords don't match.");
      return;
    }
    const { error: err } = await authClient.resetPassword({ newPassword, token });
    if (err) {
      setError(
        err.status === 400
          ? "This reset link is invalid or has expired. Ask for a new one."
          : authErrorMessage(err),
      );
      return;
    }
    navigateAfterAuthChange("/sign-in?reset=1");
  };
  return (
    <ClientForm className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
      <TextField
        id="password"
        name="password"
        type="password"
        label="New password"
        description="At least 12 characters. Resetting signs you out on every device."
        autoComplete="new-password"
        minLength={12}
        maxLength={128}
        required
      />
      <TextField
        id="confirm"
        name="confirm"
        type="password"
        label="Confirm new password"
        autoComplete="new-password"
        required
      />
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <Button action="auth.reset-password" type="submit" variant="primary">
        Set new password
      </Button>
    </ClientForm>
  );
}

export function TwoFactorForm({ next }: { readonly next: string }) {
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [error, setError] = useState<string | null>(null);
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code") ?? "").replace(/\s+/g, "");
    const trustDevice = form.get("trust") === "on";
    const { error: err } =
      mode === "totp"
        ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
        : await authClient.twoFactor.verifyBackupCode({ code, trustDevice });
    if (err) {
      setError(
        err.code === "INVALID_TWO_FACTOR_COOKIE"
          ? "Your sign-in attempt expired. Sign in again."
          : "That code didn't work. Check it and try again.",
      );
      return;
    }
    navigateAfterAuthChange(next);
  };
  return (
    <ClientForm className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
      {mode === "totp" ? (
        <TextField
          key="totp"
          id="code"
          name="code"
          label="6-digit code from your authenticator app"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          required
        />
      ) : (
        <TextField
          key="backup"
          id="code"
          name="code"
          label="Backup code"
          autoComplete="off"
          required
        />
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="trust" className="size-4" /> Trust this browser for 30 days
      </label>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <Button action="auth.verify-second-factor" type="submit" variant="primary">
        Verify
      </Button>
      <Button
        action="auth.second-factor-mode"
        variant="ghost"
        size="sm"
        onClick={() => {
          setError(null);
          setMode((m) => (m === "totp" ? "backup" : "totp"));
        }}
      >
        {mode === "totp" ? "Use a backup code instead" : "Use your authenticator app instead"}
      </Button>
    </ClientForm>
  );
}
