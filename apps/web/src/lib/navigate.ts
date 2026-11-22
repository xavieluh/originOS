/**
 * Full page load, used only when the signed-in identity changes (sign-in,
 * sign-out, second factor, password reset). Client router caches may hold the
 * previous person's pages; a real navigation discards them and re-runs every
 * server layout with the new session cookie.
 */
export function navigateAfterAuthChange(path: string): void {
  window.location.replace(new URL(path, window.location.origin).href);
}
