import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EnvValidationError, envFields, parseEnv } from "../src/env.js";

const schema = z.object({
  NODE_ENV: envFields.nodeEnv,
  PORT: envFields.port(4000),
  DATABASE_URL: envFields.url.optional(),
  API_TOKEN: z.string().min(32),
});

describe("parseEnv", () => {
  it("applies defaults and coerces numbers", () => {
    const env = parseEnv("test-service", schema, { API_TOKEN: "x".repeat(32), PORT: "4100" });
    expect(env).toEqual({ NODE_ENV: "development", PORT: 4100, API_TOKEN: "x".repeat(32) });
  });

  it("treats empty strings as unset", () => {
    const env = parseEnv("test-service", schema, { API_TOKEN: "x".repeat(32), DATABASE_URL: "" });
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("reports every invalid variable by name", () => {
    try {
      parseEnv("test-service", schema, {
        PORT: "99999",
        NODE_ENV: "staging",
        DATABASE_URL: "nope",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const variables = (error as EnvValidationError).issues.map((i) => i.variable).sort();
      expect(variables).toEqual(["API_TOKEN", "DATABASE_URL", "NODE_ENV", "PORT"]);
      expect((error as Error).message).toContain("API_TOKEN: is required");
    }
  });

  it("never includes a variable's value in the error message", () => {
    const secret = "sk-very-secret-value";
    try {
      parseEnv("test-service", schema, { API_TOKEN: secret, DATABASE_URL: secret });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
      expect(JSON.stringify((error as EnvValidationError).issues)).not.toContain(secret);
    }
  });
});

describe("parseEnv with cross-field rules", () => {
  const withRule = z
    .object({ NODE_ENV: envFields.nodeEnv, DATABASE_URL: envFields.url.optional() })
    .refine((env) => env.NODE_ENV !== "production" || env.DATABASE_URL !== undefined, {
      path: ["DATABASE_URL"],
      message: "is required when NODE_ENV=production",
    });

  it("reports the refinement's own message", () => {
    expect(() => parseEnv("svc", withRule, { NODE_ENV: "production" })).toThrow(
      "DATABASE_URL: is required when NODE_ENV=production",
    );
    expect(parseEnv("svc", withRule, { NODE_ENV: "development" })).toEqual({
      NODE_ENV: "development",
    });
  });
});
