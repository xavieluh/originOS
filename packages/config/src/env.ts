import { z } from "zod";

/** One problem with one environment variable. Never carries the variable's value. */
export interface EnvIssue {
  readonly variable: string;
  readonly message: string;
}

/**
 * Thrown when the environment does not satisfy a service's schema.
 * The message names variables and rules only, so it is safe to log even when
 * the offending variable holds a secret.
 */
export class EnvValidationError extends Error {
  readonly issues: readonly EnvIssue[];

  constructor(service: string, issues: readonly EnvIssue[]) {
    const lines = issues.map((issue) => `  - ${issue.variable}: ${issue.message}`);
    super(`Invalid environment for ${service}:\n${lines.join("\n")}`);
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

export type EnvSource = Readonly<Record<string, string | undefined>>;

/**
 * Validate `source` (normally `process.env`) against a Zod object schema.
 * Empty strings are treated as unset so that `FOO=` in a .env file means "not provided".
 */
export function parseEnv<Shape extends z.ZodRawShape>(
  service: string,
  schema: z.ZodObject<Shape>,
  source: EnvSource = process.env,
): z.infer<z.ZodObject<Shape>> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== "") cleaned[key] = value;
  }
  const result = schema.safeParse(cleaned);
  if (result.success) return result.data;

  const issues = result.error.issues.map((issue) => ({
    variable: issue.path.map(String).join(".") || "(root)",
    // Zod issue messages describe the rule (e.g. "Invalid URL"); they do not
    // include the received value for the types used in env schemas. We still
    // use our own wording for the common cases to stay explicit.
    message: describeIssue(issue),
  }));
  throw new EnvValidationError(service, issues);
}

function describeIssue(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return issue.input === undefined ? "is required" : `must be a ${issue.expected}`;
    case "invalid_value":
      return `must be one of: ${issue.values.map(String).join(", ")}`;
    case "invalid_format":
      return `must be a valid ${issue.format}`;
    case "custom":
      // Messages of custom refinements are written by us and never echo input.
      return issue.message;
    case "too_small":
    case "too_big":
      return "is out of range";
    default:
      return "is invalid";
  }
}

/** Common building blocks for service env schemas. */
export const envFields = {
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  port: (defaultPort: number) => z.coerce.number().int().min(1).max(65535).default(defaultPort),
  /** Loopback by default so a fresh checkout never listens on public interfaces. */
  host: z.string().min(1).default("127.0.0.1"),
  url: z.url(),
} as const;
