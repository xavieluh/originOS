import { envFields, parseEnv, type EnvSource } from "@originos/config";
import { z } from "zod";

const ApiEnvSchema = z
  .object({
    NODE_ENV: envFields.nodeEnv,
    LOG_LEVEL: envFields.logLevel,
    API_PORT: envFields.port(4000),
    API_HOST: envFields.host,
    /** Optional in development and test so the API can start before Postgres exists. */
    DATABASE_URL: envFields.url.optional(),
    /**
     * The browser-facing origin of apps/web. Auth cookies, CSRF origin checks,
     * passkey relying-party ID and links in emails all derive from it.
     */
    ORIGINOS_PUBLIC_URL: envFields.url.default("http://localhost:3000"),
    /** Signs and encrypts auth cookies and 2FA secrets. 32+ characters; required in production. */
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    /** smtp:// or smtps:// URL. Without it, email delivery reports "not configured". */
    SMTP_URL: envFields.url.optional(),
    MAIL_FROM: z.string().min(3).default("OriginOS <no-reply@localhost>"),
  })
  .refine((env) => env.NODE_ENV !== "production" || env.DATABASE_URL !== undefined, {
    path: ["DATABASE_URL"],
    message: "is required when NODE_ENV=production",
  })
  .refine((env) => env.NODE_ENV !== "production" || env.BETTER_AUTH_SECRET !== undefined, {
    path: ["BETTER_AUTH_SECRET"],
    message: "is required when NODE_ENV=production",
  })
  .refine(
    (env) => env.NODE_ENV !== "production" || env.ORIGINOS_PUBLIC_URL.startsWith("https://"),
    {
      path: ["ORIGINOS_PUBLIC_URL"],
      message: "must use https when NODE_ENV=production",
    },
  );

export type ApiEnv = z.infer<typeof ApiEnvSchema>;

export function loadApiEnv(source: EnvSource = process.env): ApiEnv {
  return parseEnv("api", ApiEnvSchema, source);
}
