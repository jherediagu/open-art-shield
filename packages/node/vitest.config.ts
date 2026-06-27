import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Resolve @openartshield/core to its TypeScript source so tests don't depend on
// the core package being built first.
const coreSrc = fileURLToPath(new URL("../core/src/index.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@openartshield/core": coreSrc,
    },
  },
  test: {
    // Image transforms round-trip through sharp; give them generous headroom.
    testTimeout: 30000,
  },
});
