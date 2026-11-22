import { CircleAlert, Clock3, Inbox, Construction } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../cx.js";

interface StateFrameProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly children?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
  readonly role?: "status" | "alert";
}

function StateFrame({ icon, title, children, action, className, role }: StateFrameProps) {
  return (
    <div
      className={cx(
        "flex flex-col items-start gap-2 rounded-lg border border-dashed border-border-strong bg-surface-alt/60 p-5",
        className,
      )}
      role={role}
    >
      <div className="flex items-center gap-2 text-fg">
        {icon}
        <p className="font-semibold">{title}</p>
      </div>
      {children ? <div className="text-sm text-fg-muted">{children}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/** Nothing exists yet, and the feature does exist. */
export function EmptyState(props: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <StateFrame icon={<Inbox className="size-5 text-fg-muted" aria-hidden />} {...props} />;
}

/** Work in progress. Announced politely to screen readers. */
export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-5"
    >
      <span className="sr-only">{label}</span>
      <div className="flex items-center gap-2 text-fg-muted" aria-hidden>
        <Clock3 className="size-4 animate-pulse" />
        <span className="text-sm">{label}…</span>
      </div>
      <div className="h-3 w-2/3 animate-pulse rounded bg-surface-alt" aria-hidden />
      <div className="h-3 w-1/2 animate-pulse rounded bg-surface-alt" aria-hidden />
    </div>
  );
}

/** Something failed. Says what, never shows stale data as current. */
export function ErrorState(props: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <StateFrame
      role="alert"
      icon={<CircleAlert className="size-5 text-negative" aria-hidden />}
      className="border-negative bg-negative-subtle/50"
      {...props}
    />
  );
}

export interface NotYetAvailableProps {
  /** Product module or feature name, e.g. "AgentTrust flight recorder". */
  readonly feature: string;
  /** Build phase that delivers it (docs/BUILD_STATE.md). */
  readonly phase: number;
  readonly description?: string;
  readonly headingLevel?: 2 | 3;
}

/**
 * The honest state for unbuilt features: says it is not available and when it
 * is planned. Renders no controls, so nothing looks usable.
 */
export function NotYetAvailable({
  feature,
  phase,
  description,
  headingLevel = 3,
}: NotYetAvailableProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg border border-dashed border-border-strong bg-surface-alt/60 p-4"
      data-not-yet-available={feature}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading className="font-semibold text-fg">{feature}</Heading>
        <span className="inline-flex items-center gap-1 rounded-pill border border-border-strong bg-surface px-2 py-0.5 text-xs font-semibold text-fg-muted">
          <Construction className="size-3.5" aria-hidden />
          Not yet available · Phase {String(phase).padStart(2, "0")}
        </span>
      </div>
      {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
    </div>
  );
}
