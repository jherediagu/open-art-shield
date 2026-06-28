import { describe, expect, it } from "vitest";
import { createTransformersEmbeddingBackend } from "../src/index.js";
import { createSyntheticImage } from "./helpers.js";

// The real CLIP backend depends on the optional '@huggingface/transformers'
// package, which is intentionally NOT installed in this repo (CI stays on the
// deterministic mock backend). These tests cover the parts that don't need the
// model: a stable id, and a clear error when the optional dependency is missing.

describe("transformers embedding backend (optional dependency)", () => {
  it("exposes a stable id that includes the model", () => {
    const backend = createTransformersEmbeddingBackend({ model: "Xenova/clip-vit-base-patch32" });
    expect(backend.id).toBe("transformers:Xenova/clip-vit-base-patch32");
  });

  it("defaults the model id", () => {
    expect(createTransformersEmbeddingBackend().id).toBe(
      "transformers:Xenova/clip-vit-base-patch32",
    );
  });

  it("fails with a helpful error when '@huggingface/transformers' is absent", async () => {
    const backend = createTransformersEmbeddingBackend();
    await expect(backend.embedImage(createSyntheticImage(32, 32, 3))).rejects.toThrow(
      /@huggingface\/transformers/,
    );
  });
});
