"use client";

import { Button, TextField } from "@originos/ui";
import { ClientForm } from "../client-form";
import { navigateAfterAuthChange } from "../../lib/navigate";
import { KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { authClient, authErrorMessage } from "../../lib/auth-client";
import { FormMessage, TextLink } from "./auth-panel";

export function SignInForm({
  next,
  passkeys,
}: {
  readonly next: string;
  readonly passkeys: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    setBusy(true);
    setError(null);
    setInfo(null);
    setUnverifiedEmail(null);
    const { data, error: err } = await authClient.signIn.email({
      email,
      password: String(form.get("password") ?? ""),
    });
    setBusy(false);
    if (err) {
      if (err.status === 403) {
        setUnverifiedEmail(email);
        setError("Verify your email address before signing in. We sent you a new link.");
      } else {
        setError(
          err.status === 401
            ? "That email and password don't match an account."
            : authErrorMessage(err),
        );
      }
      return;
    }
    // With two-factor on, the client plugin sends the person to /two-factor instead.
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return;
    navigateAfterAuthChange(next);
  };

  const resend = async () => {
    if (!unverifiedEmail) return;
    const { error: err } = await authClient.sendVerificationEmail({
      email: unverifiedEmail,
      callbackURL: next,
    });
    if (err) setError(authErrorMessage(err));
    else
      setInfo("If that account exists and is unverified, a new verification link is on its way.");
  };

  const withPasskey = async () => {
    setError(null);
    const result = await authClient.signIn.passkey();
    if (result?.error) {
      setError(authErrorMessage(result.error));
      return;
    }
    navigateAfterAuthChange(next);
  };

  return (
    <div className="flex flex-col gap-5">
      <ClientForm className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
        <TextField
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="username webauthn"
          required
        />
        <TextField
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          required
        />
        {error ? (
          <div id="sign-in-error">
            <FormMessage tone="error">{error}</FormMessage>
          </div>
        ) : null}
        {info ? <FormMessage tone="info">{info}</FormMessage> : null}
        <Button action="auth.sign-in" type="submit" variant="primary">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </ClientForm>
      {unverifiedEmail ? (
        <Button
          action="auth.resend-verification"
          onClick={() => void resend()}
          variant="secondary"
          size="sm"
        >
          Send the verification link again
        </Button>
      ) : null}
      {passkeys ? (
        <Button action="auth.sign-in-passkey" onClick={() => void withPasskey()} icon={KeyRound}>
          Sign in with a passkey
        </Button>
      ) : null}
      <p className="text-sm">
        <TextLink href="/forgot-password">Forgot your password?</TextLink>
      </p>
    </div>
  );
}
