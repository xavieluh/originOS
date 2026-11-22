import type { ComponentType } from "react";
import { cx } from "../cx.js";

export type BadgeTone = "neutral" | "accent" | "positive" | "warning" | "negative" | "info";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-alt text-fg-muted border-border-strong",
  accent: "bg-accent-subtle text-accent-text border-accent",
  positive: "bg-positive-subtle text-positive border-positive",
  warning: "bg-warning-subtle text-warning border-warning",
  negative: "bg-negative-subtle text-negative border-negative",
  info: "bg-info-subtle text-info border-info",
};

export interface BadgeProps {
  /** Visible text. Meaning is always in words, never color alone. */
  readonly label: string;
  readonly tone: BadgeTone;
  readonly icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  readonly className?: string;
}

export function Badge({ label, tone, icon: Icon, className }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
      data-tone={tone}
    >
      {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
      {label}
    </span>
  );
}

/** Kept from Phase 01: three-tone status pill. */
export type StatusTone = "positive" | "neutral" | "negative";
export function StatusBadge({
  label,
  tone,
}: {
  readonly label: string;
  readonly tone: StatusTone;
}) {
  return <Badge label={label} tone={tone} />;
}

export interface EventBadgeProps {
  /** What happened, e.g. "Agent action observed". */
  readonly label: string;
  /**
   * How the fact is known. Keeps observed, confirmed, declared and assessed
   * facts visually distinct (MASTER_SPEC §3 assurance vocabulary).
   */
  readonly basis: "observed" | "confirmed" | "declared" | "assessed" | "validated" | "failed";
  readonly icon?: BadgeProps["icon"];
}

const basisTone: Record<EventBadgeProps["basis"], BadgeTone> = {
  observed: "info",
  confirmed: "positive",
  validated: "accent",
  declared: "neutral",
  assessed: "warning",
  failed: "negative",
};

export function EventBadge({ label, basis, icon }: EventBadgeProps) {
  return <Badge label={label} tone={basisTone[basis]} {...(icon ? { icon } : {})} />;
}
