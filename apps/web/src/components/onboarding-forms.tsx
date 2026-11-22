"use client";

import { Button, TextField } from "@originos/ui";
import { ClientForm } from "./client-form";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createOrganizationAction, switchOrganizationAction } from "../app/actions/tenancy";
import type { Membership } from "../lib/session-types";
import { FormMessage } from "./auth/auth-panel";

export function CreateOrganizationForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    setBusy(true);
    setError(null);
    const result = await createOrganizationAction(name);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push("/home");
    router.refresh();
  };
  return (
    <ClientForm className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
      <TextField
        id="org-name"
        name="name"
        label="Organization name"
        description="Your team, lab, newsroom or studio. You can rename it later."
        minLength={2}
        maxLength={80}
        required
      />
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <Button action="organization.create" type="submit" variant="primary">
        {busy ? "Creating…" : "Create organization"}
      </Button>
    </ClientForm>
  );
}

export function PickOrganization({ memberships }: { readonly memberships: readonly Membership[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const pick = async (id: string) => {
    const result = await switchOrganizationAction(id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push("/home");
    router.refresh();
  };
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {memberships.map((m) => (
          <li
            key={m.organizationId}
            className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{m.name}</span>
              <span className="block text-xs text-fg-muted capitalize">{m.role}</span>
            </span>
            <Button
              action="organization.open"
              size="sm"
              onClick={() => void pick(m.organizationId)}
            >
              Open
            </Button>
          </li>
        ))}
      </ul>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
    </div>
  );
}
