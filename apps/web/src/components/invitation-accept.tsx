"use client";

import { Button, ErrorState, LoadingState } from "@originos/ui";
import { navigateAfterAuthChange } from "../lib/navigate";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  acceptInvitationAction,
  lookupInvitationAction,
  type InvitationPreview,
} from "../app/actions/tenancy";
import { authClient } from "../lib/auth-client";
import { FormMessage, TextLink } from "./auth/auth-panel";

const STORAGE_KEY = "originos.invitation-token";
const HERE = "/invitations/accept";

/**
 * The token arrives in the URL fragment (#token=…), which browsers never send
 * to servers, so it stays out of access logs and Referer headers. It is moved
 * to sessionStorage for the trip through sign-in, then sent only in POST bodies.
 */
function readToken(): string | null {
  const hash = new URLSearchParams(window.location.hash.slice(1)).get("token");
  try {
    if (hash) {
      sessionStorage.setItem(STORAGE_KEY, hash);
      window.history.replaceState(null, "", HERE);
      return hash;
    }
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return hash;
  }
}

function forgetToken() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "signed-out" }
  | { kind: "error"; message: string }
  | { kind: "ready"; token: string; invitation: InvitationPreview };

export function InvitationAccept() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const token = readToken();
      void (token ? lookupInvitationAction(token) : Promise.resolve(null)).then((result) => {
        if (cancelled) return;
        if (!token || !result) return setState({ kind: "missing" });
        if (result.ok) return setState({ kind: "ready", token, invitation: result.data });
        if (result.status === 401) return setState({ kind: "signed-out" });
        if (result.status === 404) forgetToken();
        setState({ kind: "error", message: result.message });
      });
    };
    load();
    // Opening another invitation link in this tab changes only the fragment, not the page.
    window.addEventListener("hashchange", load);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", load);
    };
  }, []);

  const accept = async (token: string) => {
    setBusy(true);
    setAcceptError(null);
    const result = await acceptInvitationAction(token);
    setBusy(false);
    if (!result.ok) {
      setAcceptError(result.message);
      return;
    }
    forgetToken();
    router.push("/home");
    router.refresh();
  };

  const switchAccount = async () => {
    await authClient.signOut();
    navigateAfterAuthChange(`/sign-in?next=${encodeURIComponent(HERE)}`);
  };

  switch (state.kind) {
    case "loading":
      return <LoadingState label="Checking your invitation" />;
    case "missing":
      return (
        <ErrorState title="No invitation found">
          Open the link from your invitation email again. Links only work in the browser tab they
          were opened in.
        </ErrorState>
      );
    case "signed-out":
      return (
        <div className="flex flex-col gap-4">
          <FormMessage tone="info">
            Sign in, or create an account, with the email address the invitation was sent to.
            You&apos;ll come back here to accept it.
          </FormMessage>
          <div className="flex flex-wrap gap-3">
            <Button
              action="invitation.sign-in"
              href={`/sign-in?next=${encodeURIComponent(HERE)}`}
              variant="primary"
            >
              Sign in
            </Button>
            <Button action="invitation.sign-up" href={`/sign-up?next=${encodeURIComponent(HERE)}`}>
              Create an account
            </Button>
          </div>
        </div>
      );
    case "error":
      return <ErrorState title="This invitation can't be used">{state.message}</ErrorState>;
    case "ready": {
      const { invitation, token } = state;
      const org = invitation.organizationName ?? "an organization";
      if (invitation.status !== "pending") {
        const why = {
          accepted: "has already been used",
          revoked: "was withdrawn",
          expired: "has expired",
        }[invitation.status];
        return (
          <ErrorState title={`This invitation ${why}`}>
            Ask someone at {org} to send you a new one.{" "}
            <TextLink href="/home">Go to your workspace</TextLink>
          </ErrorState>
        );
      }
      if (!invitation.emailMatches) {
        return (
          <div className="flex flex-col gap-4">
            <ErrorState title="This invitation is for a different email address">
              It was sent to {invitation.email}. Sign in with that address to accept it.
            </ErrorState>
            <Button action="invitation.switch-account" onClick={() => void switchAccount()}>
              Sign out and use another account
            </Button>
          </div>
        );
      }
      return (
        <div className="flex flex-col gap-4">
          <p className="text-fg">
            You&apos;re invited to join <strong>{org}</strong> as{" "}
            {invitation.role === "admin" ? "an admin" : "a member"}.
          </p>
          <p className="text-sm text-fg-muted">
            The invitation expires on{" "}
            {new Date(invitation.expiresAt).toLocaleDateString(undefined, { dateStyle: "long" })}.
          </p>
          {acceptError ? <FormMessage tone="error">{acceptError}</FormMessage> : null}
          <Button action="invitation.accept" onClick={() => void accept(token)} variant="primary">
            {busy ? "Joining…" : `Join ${org}`}
          </Button>
        </div>
      );
    }
  }
}
