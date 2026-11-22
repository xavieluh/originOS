import { ErrorState } from "@originos/ui";
import type { AuthConfig } from "../../lib/auth-config";

/** Explicit setup-required state (CLAUDE.md rule 4) instead of a form that cannot work. */
export function AccountsUnavailable({ config }: { readonly config: AuthConfig }) {
  if (config.accounts === "available") return null;
  return (
    <ErrorState
      title={
        config.accounts === "unreachable"
          ? "The OriginOS API is unreachable"
          : "Accounts are not set up"
      }
    >
      {config.accounts === "unreachable"
        ? "Sign-in needs the API. Start it (pnpm dev) or check ORIGINOS_API_URL, then reload."
        : "The API has no database configured, so accounts cannot be created or used. See DEVELOPMENT.md."}
    </ErrorState>
  );
}
