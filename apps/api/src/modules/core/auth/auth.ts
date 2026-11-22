import { passkey } from "@better-auth/passkey";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { Db } from "@originos/db";
import { schema, withScope } from "@originos/db";
import { sql } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import type { Mailer } from "../mail/mailer.js";
import { resetPasswordMessage, verifyEmailMessage } from "../mail/templates.js";

export const AUTH_BASE_PATH = "/api/auth";

export interface AuthConfig {
  readonly db: Db;
  readonly mailer: Mailer;
  /** Browser-facing origin of apps/web, e.g. https://app.example.com. */
  readonly publicUrl: string;
  readonly secret: string;
  /** Per-IP request limits on auth endpoints. Off only in tests. */
  readonly rateLimit: boolean;
  /** Called when sending an auth email fails; must not log the message body or URL. */
  readonly onMailError: (kind: "verification" | "password_reset", error: unknown) => void;
}

/**
 * Better Auth (ADR-022) owns credential handling: email + password (scrypt),
 * email verification, password reset, sessions in httpOnly cookies, TOTP 2FA
 * with backup codes, and passkeys (WebAuthn). Organizations are not delegated
 * to it: tenancy lives in OriginOS's own tables with row-level security.
 */
export function createAuth(config: AuthConfig) {
  const { db, mailer, publicUrl } = config;
  const origin = new URL(publicUrl).origin;
  const send = (
    kind: "verification" | "password_reset",
    message: Parameters<Mailer["send"]>[0],
  ) => {
    // Not awaited, per Better Auth guidance, so response time does not reveal whether an account exists.
    void mailer.send(message).catch((error: unknown) => config.onMailError(kind, error));
  };

  return betterAuth({
    appName: "OriginOS",
    baseURL: origin,
    basePath: AUTH_BASE_PATH,
    secret: config.secret,
    trustedOrigins: [origin],
    telemetry: { enabled: false },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        twoFactor: schema.twoFactors,
        passkey: schema.passkeys,
      },
    }),
    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix: "originos",
      useSecureCookies: origin.startsWith("https://"),
      // Better Auth skips origin/CSRF checks when it detects a test runner. Pin them on,
      // so tests exercise the production behaviour and a stray NODE_ENV=test cannot disable them.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      // The API is reachable only from the web app's server, which forwards the browser's
      // address here; rate limits and session records use it instead of the proxy's.
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 3600,
      sendResetPassword: async ({ user, url }) =>
        send("password_reset", resetPasswordMessage(user.email, url)),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) =>
        send("verification", verifyEmailMessage(user.email, url)),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 15,
      additionalFields: {
        activeOrganizationId: { type: "string", required: false, input: false },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => ({
            data: {
              ...session,
              activeOrganizationId: await defaultOrganizationFor(db, session.userId),
            },
          }),
        },
      },
    },
    rateLimit: { enabled: config.rateLimit, window: 60, max: 30, storage: "memory" },
    plugins: [
      twoFactor({ issuer: "OriginOS" }),
      passkey({ rpID: new URL(origin).hostname, rpName: "OriginOS", origin }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * The workspace a new session opens in: the organization the person used most
 * recently in any session, else their oldest membership, else none (onboarding).
 * Runs under row-level security as the person, so it can only see their own rows.
 */
export async function defaultOrganizationFor(db: Db, userId: string): Promise<string | null> {
  const result = await withScope(db, { userId }, (tx) =>
    tx.execute<{ tenant_id: string }>(sql`
      select m.tenant_id
      from core.memberships m
      left join lateral (
        select max(s.updated_at) as last_used
        from core.sessions s
        where s.user_id = m.user_id and s.active_organization_id = m.tenant_id
      ) recent on true
      where m.user_id = ${userId}
      order by recent.last_used desc nulls last, m.created_at asc
      limit 1`),
  );
  return result.rows[0]?.tenant_id ?? null;
}
