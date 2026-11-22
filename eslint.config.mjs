import { fileURLToPath } from "node:url";
import { createConfig } from "@originos/config/eslint";

export default createConfig({ rootDir: fileURLToPath(new URL(".", import.meta.url)) });
