import type { ReactNode } from "react";

export interface AppShellProps {
  readonly productName: string;
  /** Short line under the product name, e.g. the current surface. */
  readonly tagline?: string;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}

/**
 * Page frame with a skip link and the header/main/footer landmarks.
 * Navigation is added in Phase 03 once there are real destinations;
 * this shell deliberately renders no links to unbuilt routes.
 */
export function AppShell({ productName, tagline, footer, children }: AppShellProps) {
  return (
    <div className="oo-shell">
      <a className="oo-skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="oo-header">
        <p className="oo-product">{productName}</p>
        {tagline ? <p className="oo-tagline">{tagline}</p> : null}
      </header>
      <main id="main-content" className="oo-main" tabIndex={-1}>
        {children}
      </main>
      {footer ? <footer className="oo-footer">{footer}</footer> : null}
    </div>
  );
}
