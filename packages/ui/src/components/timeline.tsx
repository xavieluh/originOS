import type { ReactNode } from "react";

export interface TimelineItem {
  readonly id: string;
  /** ISO 8601 timestamp; rendered in monospace with a machine-readable <time>. */
  readonly at: string;
  readonly title: string;
  readonly description?: ReactNode;
  readonly badge?: ReactNode;
}

export function Timeline({
  items,
  label,
}: {
  readonly items: readonly TimelineItem[];
  readonly label: string;
}) {
  return (
    <ol aria-label={label} className="relative ml-2 border-l border-border-strong">
      {items.map((item) => (
        <li key={item.id} className="relative pb-5 pl-6 last:pb-0">
          <span
            aria-hidden
            className="absolute -left-[5px] top-1.5 size-2.5 rounded-full border-2 border-accent bg-surface"
          />
          <div className="flex flex-wrap items-center gap-2">
            <time dateTime={item.at} className="font-mono text-xs text-fg-muted">
              {item.at.replace("T", " ").replace(/\.\d+Z$|Z$/, " UTC")}
            </time>
            {item.badge}
          </div>
          <p className="mt-1 font-medium text-fg">{item.title}</p>
          {item.description ? (
            <div className="mt-0.5 text-sm text-fg-muted">{item.description}</div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
