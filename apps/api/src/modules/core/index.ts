// Core context (ARCHITECTURE §5): accounts and sessions, tenancy, authorization and consent, and outbound email.
export { AUTH_BASE_PATH, createAuth } from "./auth/auth.js";
export type { Auth, AuthConfig } from "./auth/auth.js";
export { AuthModule } from "./auth/auth.module.js";
export { mountAuthHandler } from "./auth/auth.route.js";
export {
  AcceptsBinaryBody,
  CorrelationId,
  CurrentPrincipal,
  CurrentTenant,
  Public,
  RequirePermission,
  RequireTenant,
} from "./auth/decorators.js";
export type { Principal, TenantContext } from "./auth/principal.js";
export { ApiError, badRequest, conflict, forbidden, notFound } from "./auth/errors.js";
export { APP_DB } from "./auth/tokens.js";
export { recordAudit } from "./audit/audit.js";
export { parse } from "./tenancy/validation.js";
export { MemoryMailer, NotConfiguredMailer, SmtpMailer, createMailer } from "./mail/mailer.js";
export type { MailMessage, Mailer } from "./mail/mailer.js";
