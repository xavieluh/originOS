// Core context (ARCHITECTURE §5): accounts and sessions, tenancy, and outbound email.
export { AUTH_BASE_PATH, createAuth } from "./auth/auth.js";
export type { Auth, AuthConfig } from "./auth/auth.js";
export { AuthModule } from "./auth/auth.module.js";
export { mountAuthHandler } from "./auth/auth.route.js";
export { Public, RequireTenant } from "./auth/decorators.js";
export { MemoryMailer, NotConfiguredMailer, SmtpMailer, createMailer } from "./mail/mailer.js";
export type { MailMessage, Mailer } from "./mail/mailer.js";
