// drizzle-kit configuration. Migrations are generated into ./migrations and
// reviewed like code; tables are never replaced in place (CLAUDE.md rule 12).
// drizzle-kit is installed in Phase 06 together with the first schema.
export default {
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
};
