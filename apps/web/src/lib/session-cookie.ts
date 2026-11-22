/** Better Auth cookie names with the "originos" prefix (ADR-022). `__Secure-` is added on https. */
export const SESSION_COOKIE_NAMES = [
  "originos.session_token",
  "__Secure-originos.session_token",
] as const;

export function hasSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(";").some((part) => {
    const name = part.split("=")[0]?.trim();
    return SESSION_COOKIE_NAMES.includes(name as (typeof SESSION_COOKIE_NAMES)[number]);
  });
}

/** Paths that need a signed-in person. Everything else in the app is public or handles auth itself. */
const PRIVATE_PREFIXES = [
  "/home",
  "/agents",
  "/research",
  "/publish",
  "/trust",
  "/discover",
  "/integrations",
  "/settings",
  "/developers",
  "/onboarding",
];

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Only same-site relative paths are accepted as post-sign-in destinations (no open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/home"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return fallback;
  return next;
}

/** Set by the proxy on every request; overwritten, so a client-sent value is never trusted. */
export const REQUEST_PATH_HEADER = "x-originos-path";
