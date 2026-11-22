import type { LinkComponent } from "@originos/ui";
import Link from "next/link";

/** Adapts next/link to the design system's LinkComponent slot. */
export const NextLink: LinkComponent = ({ href, className, children, onClick, ...rest }) => (
  <Link
    href={href}
    className={className}
    {...(onClick ? { onClick } : {})}
    aria-current={rest["aria-current"]}
  >
    {children}
  </Link>
);
