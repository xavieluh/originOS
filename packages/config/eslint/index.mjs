// Shared flat ESLint config for every TypeScript workspace package.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { createBoundariesPlugin } from "./boundaries.mjs";

/**
 * @param {{ rootDir: string }} options rootDir is the absolute repository root.
 */
export function createConfig({ rootDir }) {
  return tseslint.config(
    {
      ignores: [
        "**/node_modules/**",
        "**/dist/**",
        "**/.next/**",
        "**/.turbo/**",
        "**/.venv/**",
        "**/coverage/**",
        "**/next-env.d.ts",
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      languageOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
        globals: { ...globals.node },
      },
      plugins: { originos: createBoundariesPlugin(rootDir) },
      rules: {
        "originos/boundaries": "error",
        "no-console": "error",
      },
    },
    {
      files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
      rules: {
        "@typescript-eslint/consistent-type-imports": "error",
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
      },
    },
    {
      files: ["**/*.test.ts", "**/*.test.tsx", "**/test/**"],
      rules: { "no-console": "off" },
    },
  );
}
