"use client";

import { Button, ThemeToggle, cx } from "@originos/ui";
import { navigateAfterAuthChange } from "../lib/navigate";
import { Building2, Check, ChevronDown, LogOut, Plus, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { switchOrganizationAction } from "../app/actions/tenancy";
import { authClient } from "../lib/auth-client";
import type { WorkspaceSession } from "../lib/session-types";

/** A small disclosure menu: Escape and outside clicks close it, focus returns to the trigger. */
function Menu({
  label,
  action,
  icon,
  children,
}: {
  readonly label: ReactNode;
  readonly action: string;
  readonly icon: ReactNode;
  readonly children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        data-action={action}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 max-w-56 shrink-0 items-center gap-1 rounded-md border border-border-strong bg-surface px-2 sm:gap-2 sm:px-3 text-sm font-medium text-fg hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {icon}
        {/* Icon-only on phones; the name stays available to assistive tech. */}
        <span className="sr-only truncate sm:not-sr-only">{label}</span>
        <ChevronDown className="size-4 shrink-0 text-fg-muted" aria-hidden />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute right-0 z-30 mt-2 w-72 rounded-lg border border-border bg-surface p-2 shadow-lg"
      >
        {open ? children(() => setOpen(false)) : null}
      </div>
    </div>
  );
}

export function WorkspaceSwitcher({ session }: { readonly session: WorkspaceSession }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const switchTo = async (organizationId: string, close: () => void) => {
    setPending(organizationId);
    setError(null);
    const result = await switchOrganizationAction(organizationId);
    setPending(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    close();
    router.push("/home");
    router.refresh();
  };
  return (
    <Menu
      action="workspace.switcher"
      label={
        <span>
          <span className="sr-only">Workspace: </span>
          {session.active.name}
        </span>
      }
      icon={<Building2 className="size-4 shrink-0 text-fg-muted" aria-hidden />}
    >
      {(close) => (
        <div>
          <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-fg-muted">
            Your organizations
          </p>
          <ul className="flex flex-col">
            {session.me.memberships.map((m) => {
              const current = m.organizationId === session.active.organizationId;
              return (
                <li key={m.organizationId}>
                  <button
                    type="button"
                    data-action="workspace.switch"
                    aria-current={current ? "true" : undefined}
                    disabled={pending !== null}
                    onClick={() => (current ? close() : void switchTo(m.organizationId, close))}
                    className={cx(
                      "flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-alt",
                      "focus-visible:outline-2 focus-visible:outline-focus",
                      current && "font-semibold",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{m.name}</span>
                      <span className="block text-xs font-normal text-fg-muted capitalize">
                        {m.role}
                      </span>
                    </span>
                    {current ? <Check className="size-4 text-accent-text" aria-hidden /> : null}
                    {pending === m.organizationId ? (
                      <span className="text-xs text-fg-muted">Switching…</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {error ? (
            <p role="alert" className="px-2 py-1 text-sm text-negative">
              {error}
            </p>
          ) : null}
          <div className="mt-1 border-t border-border pt-2">
            <Button
              action="workspace.create"
              href="/onboarding?new=1"
              variant="ghost"
              size="sm"
              icon={Plus}
            >
              Create organization
            </Button>
          </div>
        </div>
      )}
    </Menu>
  );
}

export function UserMenu({ session }: { readonly session: WorkspaceSession }) {
  const [error, setError] = useState<string | null>(null);
  const signOut = async () => {
    const { error: err } = await authClient.signOut();
    if (err) {
      setError("Could not sign out. Try again.");
      return;
    }
    navigateAfterAuthChange("/sign-in");
  };
  return (
    <Menu
      action="account.menu"
      label={
        <span>
          <span className="sr-only">Account: </span>
          {session.me.user.name}
        </span>
      }
      icon={<UserRound className="size-4 shrink-0 text-fg-muted" aria-hidden />}
    >
      {() => (
        <div className="flex flex-col gap-2 p-1">
          <div className="min-w-0 px-1">
            <p className="truncate text-sm font-medium">{session.me.user.name}</p>
            <p className="truncate text-xs text-fg-muted">{session.me.user.email}</p>
          </div>
          <Button
            action="account.settings"
            href="/settings/account"
            variant="ghost"
            size="sm"
            icon={UserRound}
          >
            Account and security
          </Button>
          <Button
            action="account.sign-out"
            onClick={() => void signOut()}
            variant="ghost"
            size="sm"
            icon={LogOut}
          >
            Sign out
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          ) : null}
          <div className="border-t border-border pt-2 sm:hidden">
            <ThemeToggle />
          </div>
        </div>
      )}
    </Menu>
  );
}
