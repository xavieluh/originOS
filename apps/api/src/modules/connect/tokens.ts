/** Injection tokens (ADR-014). */
export const CONNECT = Symbol("CONNECT");
/** Base URL providers use to reach this API's webhook route, or null when not public. */
export const WEBHOOK_BASE_URL = Symbol("WEBHOOK_BASE_URL");
/** Browser-facing origin of apps/web; OAuth redirect URIs derive from it. */
export const CONNECT_PUBLIC_ORIGIN = Symbol("CONNECT_PUBLIC_ORIGIN");
