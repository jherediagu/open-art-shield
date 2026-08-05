import { defineConfig } from "tsup";

export default defineConfig({
  entry: { verifier: "src/main.ts" },
  format: ["esm"],
  clean: true,
  sourcemap: true,
  target: "es2022",
  platform: "browser",
  // Bundle the workspace packages into one file; onnxruntime-web stays
  // external and resolves through the page's import map (CDN).
  noExternal: [/@openartshield\/.*/],
  external: ["onnxruntime-web"],
});
