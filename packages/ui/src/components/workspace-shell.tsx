"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { cx } from "../cx.js";
import { isActivePath } from "../nav.js";
import { PlainLink, type LinkComponent } from "./link.js";
import { SkipLink } from "./skip-link.js";

export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

export interface WorkspaceShellProps {
  readonly productName: string;
  /** Label for the surface, e.g. "Workspace" or "Developer console". */
  readonly surfaceLabel: string;
  readonly nav: readonly NavItem[];
  readonly secondaryNav?: readonly NavItem[];
  readonly currentPath: string;
  readonly linkComponent?: LinkComponent;
  readonly topBar?: ReactNode;
  readonly sidebarFooter?: ReactNode;
  readonly children: ReactNode;
}

function NavList({
  items,
  currentPath,
  Link,
  onNavigate,
}: {
  items: readonly NavItem[];
  currentPath: string;
  Link: LinkComponent;
  onNavigate: () => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActivePath(currentPath, href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
                active
                  ? "bg-accent-subtle text-accent-text"
                  : "text-fg-muted hover:bg-surface-alt hover:text-fg",
              )}
            >
              {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Responsive app frame: fixed sidebar from the lg breakpoint, toggled panel below it. */
export function WorkspaceShell({
  productName,
  surfaceLabel,
  nav,
  secondaryNav,
  currentPath,
  linkComponent,
  topBar,
  sidebarFooter,
  children,
}: WorkspaceShellProps) {
  const Link = linkComponent ?? PlainLink;
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [currentPath]);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <SkipLink />
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/95 px-4 backdrop-blur lg:ml-64 lg:px-8">
        <button
          type="button"
          data-action="nav.toggle"
          aria-expanded={menuOpen}
          aria-controls="primary-nav"
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded-md p-1.5 text-fg-muted hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-focus lg:hidden"
        >
          {menuOpen ? (
            <X aria-hidden className="size-5" />
          ) : (
            <Menu aria-hidden className="size-5" />
          )}
          <span className="sr-only">{menuOpen ? "Close navigation" : "Open navigation"}</span>
        </button>
        <span className="font-display text-lg font-semibold lg:hidden">{productName}</span>
        <div className="flex flex-1 items-center justify-end gap-3">{topBar}</div>
      </header>
      <nav
        id="primary-nav"
        aria-label={surfaceLabel}
        className={cx(
          "fixed bottom-0 left-0 top-14 z-20 w-64 flex-col border-r border-border bg-surface px-3 py-4 lg:top-0 lg:flex",
          menuOpen ? "flex" : "hidden",
        )}
      >
        <div className="mb-6 hidden px-3 lg:block">
          <Link
            href={nav[0]?.href ?? "/"}
            className="font-display text-xl font-semibold tracking-tight text-fg focus-visible:outline-2 focus-visible:outline-focus"
          >
            {productName}
          </Link>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-muted">
            {surfaceLabel}
          </p>
        </div>
        <NavList items={nav} currentPath={currentPath} Link={Link} onNavigate={close} />
        {secondaryNav?.length ? (
          <div className="mt-6 border-t border-border pt-4">
            <NavList
              items={secondaryNav}
              currentPath={currentPath}
              Link={Link}
              onNavigate={close}
            />
          </div>
        ) : null}
        {sidebarFooter ? <div className="mt-auto px-3 pt-4">{sidebarFooter}</div> : null}
      </nav>
      <main
        id="main-content"
        tabIndex={-1}
        className="px-4 py-8 focus:outline-none sm:px-8 lg:ml-64 lg:px-12"
      >
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
