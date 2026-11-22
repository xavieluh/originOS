import type { ComponentType, ReactNode } from "react";

export interface LinkLikeProps {
  readonly href: string;
  readonly className?: string;
  readonly children?: ReactNode;
  readonly "aria-current"?: "page" | undefined;
  readonly onClick?: () => void;
}

/** Lets the app inject its router link (for example next/link) without this package depending on Next. */
export type LinkComponent = ComponentType<LinkLikeProps>;

export function PlainLink({ href, className, children, onClick, ...rest }: LinkLikeProps) {
  return (
    <a href={href} className={className} onClick={onClick} aria-current={rest["aria-current"]}>
      {children}
    </a>
  );
}
