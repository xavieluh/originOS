import { fileURLToPath } from "node:url";
import { createConfig } from "@originos/config/eslint";
import nextVitals from "eslint-config-next/core-web-vitals";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

// Next's rules first, then the shared OriginOS config, so the shared
// TypeScript parser and the boundary rule apply on top.
export default [...nextVitals, ...createConfig({ rootDir })];
