// drizzle-kit configuration. `pnpm --filter @originos/db db:generate` writes SQL
// migrations into ./migrations; they are reviewed like code and never edited
// after they have been applied anywhere (CLAUDE.md rule 12).
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/schema.ts", "./src/domain-schema.ts", "./src/platform-schema.ts", "./src/connect-schema.ts"],
  out: "./migrations",
  schemaFilter: ["core", "trust", "content", "evidence", "agents"],
  strict: true,
  verbose: true,
});
