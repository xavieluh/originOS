import type { ReactNode } from "react";
import { PlainLink, type LinkComponent } from "./link.js";
import { SkipLink } from "./skip-link.js";

export interface PublicShellProps {
  readonly productName: string;
  readonly nav: readonly { href: string; label: string }[];
  readonly linkComponent?: LinkComponent;
  readonly headerExtra?: ReactNode;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}

/** Frame for the public network: simple top bar, wide reading column, honest footer. */
export function PublicShell({
  productName,
  nav,
  linkComponent,
  headerExtra,
  footer,
  children,
}: PublicShellProps) {
  const Link = linkComponent ?? PlainLink;
  const link =
    "rounded-md px-2 py-1 text-sm font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-focus";
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <SkipLink />
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-8">
          <Link
            href="/"
            className="font-display text-xl font-semibold tracking-tight text-fg focus-visible:outline-2 focus-visible:outline-focus"
          >
            {productName}
          </Link>
          <nav aria-label="Site" className="flex flex-1 flex-wrap gap-1">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className={link}>
                {n.label}
              </Link>
            ))}
          </nav>
          {headerExtra}
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      {footer ? (
        <footer className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-fg-muted sm:px-8">{footer}</div>
        </footer>
      ) : null}
    </div>
  );
}
