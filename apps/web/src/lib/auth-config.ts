import "server-only";
import { apiFetch } from "./api";

export interface AuthConfig {
  readonly accounts: "available" | "not_configured" | "unreachable";
  readonly emailDelivery: "configured" | "not_configured";
  readonly methods: readonly ("email_password" | "passkey")[];
  readonly secondFactors: readonly ("totp" | "backup_code")[];
}

/** What this deployment can actually do, so screens never offer a flow that cannot finish. */
export async function getAuthConfig(): Promise<AuthConfig> {
  const result = await apiFetch<AuthConfig>("/v1/auth-config");
  if (result.ok) return result.data;
  return {
    accounts: "unreachable",
    emailDelivery: "not_configured",
    methods: [],
    secondFactors: [],
  };
}
