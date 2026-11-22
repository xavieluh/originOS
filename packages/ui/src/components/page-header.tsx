import type { ReactNode } from "react";

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
}: {
  readonly title: string;
  readonly eyebrow?: string;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="mb-1 font-mono text-xs font-medium uppercase tracking-[0.14em] text-accent-text">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
          {title}
        </h1>
        {description ? <div className="mt-2 text-base text-fg-muted">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
