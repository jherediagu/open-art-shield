import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Resolve workspace packages to their TypeScript source so CLI tests don't
// depend on the other packages being built first.
const coreSrc = fileURLToPath(new URL("../core/src/index.ts", import.meta.url));
const nodeSrc = fileURLToPath(new URL("../node/src/index.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@openartshield/core": coreSrc,
      "@openartshield/node": nodeSrc,
    },
  },
  test: {
    testTimeout: 30000,
  },
});
