import type { ReactNode } from "react";
import { cx } from "../cx.js";

export interface CardProps {
  readonly title?: string;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
  /** Heading level for the title, to keep the document outline correct. */
  readonly headingLevel?: 2 | 3 | 4;
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
  headingLevel = 2,
}: CardProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section
      className={cx(
        "min-w-0 rounded-lg border border-border bg-surface p-5 shadow-[0_1px_0_rgba(0,0,0,0.03)]",
        className,
      )}
    >
      {title || actions ? (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <Heading className="font-display text-lg font-semibold text-fg">{title}</Heading>
            ) : null}
            {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
