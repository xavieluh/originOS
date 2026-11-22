"use client";

import { Button } from "@originos/ui";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { ActionResult } from "../app/actions/tenancy";
import { FormMessage } from "./auth/auth-panel";

/** Runs a server action, shows its error, and refreshes server data on success. */
export function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<ActionResult<unknown>>, success?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    if (success) setNotice(success);
    router.refresh();
    return true;
  };
  const messages: ReactNode = (
    <>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {notice ? <FormMessage tone="info">{notice}</FormMessage> : null}
    </>
  );
  return { run, busy, messages };
}

/** Two-step confirmation for consequential actions; no browser dialogs. */
export function ConfirmButton({
  action,
  label,
  confirmLabel,
  onConfirm,
}: {
  readonly action: string;
  readonly label: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <Button action={action} size="sm" variant="ghost" onClick={() => setArmed(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="inline-flex gap-2">
      <Button
        action={`${action}.confirm`}
        size="sm"
        variant="danger"
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button action={`${action}.cancel`} size="sm" variant="ghost" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
  );
}
