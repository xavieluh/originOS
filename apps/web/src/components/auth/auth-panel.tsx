import Link from "next/link";
import type { ReactNode } from "react";

/** Heading, lead text and body for every account screen. */
export function AuthPanel({
  title,
  lead,
  children,
  footer,
}: {
  readonly title: string;
  readonly lead?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-[0_1px_0_rgba(0,0,0,0.03)] sm:p-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
      {lead ? <p className="mt-2 text-sm text-fg-muted">{lead}</p> : null}
      <div className="mt-6">{children}</div>
      {footer ? (
        <div className="mt-6 border-t border-border pt-4 text-sm text-fg-muted">{footer}</div>
      ) : null}
    </div>
  );
}

export function FormMessage({
  tone,
  children,
}: {
  readonly tone: "error" | "info";
  readonly children: ReactNode;
}) {
  return tone === "error" ? (
    <p
      role="alert"
      className="rounded-md border border-negative bg-negative-subtle/50 px-3 py-2 text-sm text-negative"
    >
      {children}
    </p>
  ) : (
    <p
      role="status"
      className="rounded-md border border-border bg-surface-alt px-3 py-2 text-sm text-fg"
    >
      {children}
    </p>
  );
}

/** Inline text link with a visible underline (links in running text must not rely on colour alone). */
export function TextLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-medium text-accent-text underline underline-offset-2 hover:no-underline"
    >
      {children}
    </Link>
  );
}
