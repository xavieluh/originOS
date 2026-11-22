export type StatusTone = "positive" | "neutral" | "negative";

export interface StatusBadgeProps {
  /** Visible text. Status is always conveyed in words, never by color alone. */
  readonly label: string;
  readonly tone: StatusTone;
}

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  return (
    <span className={`oo-badge oo-badge--${tone}`} data-tone={tone}>
      {label}
    </span>
  );
}
