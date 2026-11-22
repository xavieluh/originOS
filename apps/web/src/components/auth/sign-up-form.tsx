"use client";

import { Button, TextField } from "@originos/ui";
import { ClientForm } from "../client-form";
import { useState, type FormEvent } from "react";
import { authClient, authErrorMessage } from "../../lib/auth-client";
import { FormMessage, TextLink } from "./auth-panel";

const MIN_PASSWORD = 12;

export function SignUpForm({
  next,
  mailboxUrl,
}: {
  readonly next: string;
  /** Local mail catcher, shown only outside production. */
  readonly mailboxUrl: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);
  // After verification the person lands on onboarding (create or join an organization),
  // unless they came here from a specific page such as an invitation.
  const callbackURL = next === "/home" ? "/onboarding" : next;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
      return;
    }
    const email = String(form.get("email") ?? "");
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signUp.email({
      name: String(form.get("name") ?? "").trim(),
      email,
      password,
      callbackURL,
    });
    setBusy(false);
    if (err) {
      setError(authErrorMessage(err));
      return;
    }
    setSentTo(email);
  };

  const resend = async () => {
    if (!sentTo) return;
    const { error: err } = await authClient.sendVerificationEmail({ email: sentTo, callbackURL });
    if (err) setError(authErrorMessage(err));
    else setResent(true);
  };

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4" aria-live="polite">
        <FormMessage tone="info">
          Check your email. If {sentTo} can receive mail, a verification link is on its way. It
          expires in 1 hour.
        </FormMessage>
        {resent ? <FormMessage tone="info">We sent another link.</FormMessage> : null}
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        <Button action="auth.resend-verification" onClick={() => void resend()} variant="secondary">
          Send the link again
        </Button>
        {mailboxUrl ? (
          <p className="text-sm text-fg-muted">
            Development: emails are caught locally.{" "}
            <TextLink href={mailboxUrl}>Open the dev mailbox</TextLink>.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <ClientForm className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
      <TextField
        id="name"
        name="name"
        label="Your name"
        autoComplete="name"
        required
        minLength={1}
        maxLength={120}
      />
      <TextField id="email" name="email" type="email" label="Email" autoComplete="email" required />
      <TextField
        id="password"
        name="password"
        type="password"
        label="Password"
        description={`At least ${MIN_PASSWORD} characters. A passphrase works well.`}
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
        maxLength={128}
        required
      />
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <Button action="auth.sign-up" type="submit" variant="primary">
        {busy ? "Creating account…" : "Create account"}
      </Button>
    </ClientForm>
  );
}
