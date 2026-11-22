import type { ComponentType, ReactNode } from "react";
import { cx } from "../cx.js";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

interface BaseProps {
  readonly children: ReactNode;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  readonly className?: string;
  /** Names the behavior for tests and analytics; required so every button is accounted for. */
  readonly action: string;
}

/**
 * A button always does something: it has a click handler, submits a form, or
 * is a link. A disabled button must say why, and the reason is shown next to it.
 * There is deliberately no way to render a clickable-looking control with no behavior.
 */
export type ButtonProps = BaseProps &
  (
    | { readonly onClick: () => void; readonly type?: "button"; readonly href?: never }
    | { readonly type: "submit"; readonly onClick?: never; readonly href?: never }
    | { readonly href: string; readonly onClick?: never; readonly type?: never }
  ) &
  ({ readonly disabled?: false } | { readonly disabled: true; readonly disabledReason: string });

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent/90 border border-accent",
  secondary: "bg-surface text-fg border border-border-strong hover:bg-surface-alt",
  ghost: "bg-transparent text-fg border border-transparent hover:bg-surface-alt",
  danger: "bg-surface text-negative border border-negative hover:bg-negative-subtle",
};
const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
};

export function buttonClassName(variant: ButtonVariant = "secondary", size: ButtonSize = "md") {
  return cx(
    "inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap",
    "transition-colors duration-[var(--oo-motion-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant],
    sizes[size],
  );
}

export function Button(props: ButtonProps) {
  const { children, variant, size, icon: Icon, className, action } = props;
  const classes = cx(buttonClassName(variant, size), className);
  const content = (
    <>
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
      <span>{children}</span>
    </>
  );

  if (props.disabled) {
    const reasonId = `reason-${action}`;
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={classes}
          disabled
          aria-describedby={reasonId}
          data-action={action}
        >
          {content}
        </button>
        <span id={reasonId} className="text-sm text-fg-muted">
          {props.disabledReason}
        </span>
      </span>
    );
  }
  if (props.href !== undefined) {
    return (
      <a href={props.href} className={classes} data-action={action}>
        {content}
      </a>
    );
  }
  return (
    <button
      type={props.type ?? "button"}
      className={classes}
      onClick={props.onClick}
      data-action={action}
    >
      {content}
    </button>
  );
}
