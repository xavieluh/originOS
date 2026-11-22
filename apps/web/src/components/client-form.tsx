"use client";

import { cx } from "@originos/ui";
import { useSyncExternalStore, type FormEvent, type ReactNode } from "react";

const noopSubscribe = () => () => {};

/** False during server render and hydration, true once React handles events. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * A form handled entirely in the browser. Until React has hydrated, its
 * controls are disabled, so an early submit can never fall back to a native
 * GET that would put passwords or tokens in the URL. method="post" is a second
 * guard for browsers without JavaScript.
 */
export function ClientForm({
  className,
  onSubmit,
  children,
}: {
  readonly className?: string;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly children: ReactNode;
}) {
  const hydrated = useHydrated();
  return (
    <form method="post" onSubmit={onSubmit}>
      <fieldset disabled={!hydrated} className={cx("m-0 min-w-0 border-0 p-0", className)}>
        {children}
      </fieldset>
    </form>
  );
}
