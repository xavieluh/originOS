// OriginOS architectural import boundaries (ARCHITECTURE.md §4 "Boundary rules", ADR-001).
//
// One local ESLint rule with a declarative policy table, instead of several
// overlapping `no-restricted-imports` blocks (flat config replaces, not merges,
// a rule's options when globs overlap) or a resolver-based plugin (NodeNext
// `.js` specifiers and pnpm symlinks need extra resolver setup). The rule only
// does path arithmetic on import specifiers, so it is deterministic and fast.
// See docs/DECISIONS.md ADR-013.

import path from "node:path";

/** Workspace package directories (relative to repo root) and their package names. */
export const WORKSPACE_PACKAGES = {
  "apps/web": "@originos/web",
  "apps/api": "@originos/api",
  "apps/worker": "@originos/worker",
  "apps/mcp-server": "@originos/mcp-server",
  "packages/ui": "@originos/ui",
  "packages/contracts": "@originos/contracts",
  "packages/authz": "@originos/authz",
  "packages/db": "@originos/db",
  "packages/config": "@originos/config",
  "packages/service-kit": "@originos/service-kit",
  "packages/storage": "@originos/storage",
  "packages/connect": "@originos/connect",
  "services/telemetry": "@originos/telemetry",
  "services/media-validator": "@originos/media-validator",
  "services/ai-worker": "@originos/ai-worker",
};

/** Separately deployed units. Nothing may import one of these by package name. */
export const DEPLOYABLES = [
  "apps/web",
  "apps/api",
  "apps/worker",
  "apps/mcp-server",
  "services/telemetry",
  "services/media-validator",
  "services/ai-worker",
];

/** Boundary rule 1: only the API and the worker touch the database. */
export const DATABASE_ALLOWED = ["apps/api", "apps/worker", "packages/db"];
export const DATABASE_SPECIFIERS = ["@originos/db", "pg", "postgres", "drizzle-orm", "drizzle-kit"];

/** Leaf packages and the only bare imports their src/ may use. */
export const LEAF_PACKAGES = {
  "packages/contracts": ["zod"],
  "packages/authz": [],
};

const API_MODULES_DIR = "apps/api/src/modules";

function bareName(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function packageOf(relPath) {
  return Object.keys(WORKSPACE_PACKAGES).find(
    (dir) => relPath === dir || relPath.startsWith(`${dir}/`),
  );
}

function stripExtension(p) {
  return p.replace(/\.(m|c)?(j|t)sx?$/, "");
}

/** Returns the API module name and the path inside it, for a repo-relative path. */
function apiModuleOf(relPath) {
  if (!relPath.startsWith(`${API_MODULES_DIR}/`)) return undefined;
  const rest = relPath.slice(API_MODULES_DIR.length + 1).split("/");
  return { name: rest[0], inner: stripExtension(rest.slice(1).join("/")) };
}

/**
 * Pure check used by the ESLint rule and by unit tests.
 * @param {string} rootDir absolute repo root
 * @param {string} filename absolute path of the importing file
 * @param {string} specifier the import specifier as written
 * @returns {string | undefined} violation message, or undefined when allowed
 */
export function checkImport(rootDir, filename, specifier) {
  const fromRel = toPosix(path.relative(rootDir, filename));
  const fromPkg = packageOf(fromRel);
  if (!fromPkg) return undefined;

  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    const target = path.resolve(path.dirname(filename), specifier);
    const targetRel = toPosix(path.relative(rootDir, target));
    const targetPkg = packageOf(targetRel);
    if (targetPkg !== fromPkg) {
      return `Relative import leaves ${fromPkg}. Import another workspace package by its package name.`;
    }
    const fromModule = apiModuleOf(fromRel);
    const toModule = apiModuleOf(targetRel);
    if (toModule && fromModule?.name !== toModule.name) {
      const isPublicEntry = toModule.inner === "" || toModule.inner === "index";
      if (!isPublicEntry) {
        return `API module "${toModule.name}" may only be imported through its index.ts (boundary rule 2).`;
      }
    }
    return undefined;
  }

  if (specifier.startsWith("node:")) return undefined;
  const name = bareName(specifier);

  if (DATABASE_SPECIFIERS.includes(name) && !DATABASE_ALLOWED.includes(fromPkg)) {
    return `${fromPkg} may not access the database ("${name}"). Only apps/api and apps/worker may (boundary rule 1).`;
  }

  const targetDir = Object.entries(WORKSPACE_PACKAGES).find(([, pkg]) => pkg === name)?.[0];
  if (targetDir && targetDir !== fromPkg && DEPLOYABLES.includes(targetDir)) {
    return `${fromPkg} may not import the deployable ${targetDir}. Share code through packages/*.`;
  }

  // Leaf rule covers shipped source only; tests may use test tooling.
  const leafAllowed = fromRel.startsWith(`${fromPkg}/src/`) ? LEAF_PACKAGES[fromPkg] : undefined;
  if (leafAllowed && !leafAllowed.includes(name) && name !== WORKSPACE_PACKAGES[fromPkg]) {
    return `${fromPkg} is a leaf package and may only import: ${leafAllowed.join(", ")}.`;
  }
  return undefined;
}

/** @param {string} rootDir */
export function createBoundariesPlugin(rootDir) {
  return {
    meta: { name: "originos" },
    rules: {
      boundaries: {
        meta: {
          type: "problem",
          docs: { description: "Enforce OriginOS architectural import boundaries" },
          schema: [],
        },
        create(context) {
          const filename = context.filename;
          const check = (node) => {
            if (!node || node.type !== "Literal" || typeof node.value !== "string") return;
            const message = checkImport(rootDir, filename, node.value);
            if (message) context.report({ node, message });
          };
          return {
            ImportDeclaration: (node) => check(node.source),
            ExportNamedDeclaration: (node) => check(node.source),
            ExportAllDeclaration: (node) => check(node.source),
            ImportExpression: (node) => check(node.source),
            CallExpression: (node) => {
              if (node.callee.type === "Identifier" && node.callee.name === "require") {
                check(node.arguments[0]);
              }
            },
          };
        },
      },
    },
  };
}
