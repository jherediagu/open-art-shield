import { createMockEmbeddingBackend, type EmbeddingBackend } from "@openartshield/core";
import { createTransformersEmbeddingBackend, createVaeEmbeddingBackend } from "@openartshield/node";
import { CliError } from "./errors.js";

// Resolve an embedding backend by id. "mock" (default) is a deterministic
// placeholder; "clip"/"transformers" is the real CLIP backend; "vae" is the
// Stable Diffusion VAE-encoder backend (both optional deps).
export function resolveEmbeddingBackend(
  id: string | undefined,
  model: string | undefined,
): EmbeddingBackend {
  const backendId = id ?? "mock";
  if (backendId === "mock") return createMockEmbeddingBackend();
  if (backendId === "clip" || backendId === "transformers") {
    return createTransformersEmbeddingBackend(model !== undefined ? { model } : {});
  }
  if (backendId === "vae") {
    return createVaeEmbeddingBackend(model !== undefined ? { model } : {});
  }
  throw new CliError(`Unknown backend "${backendId}". Use "mock" (default), "clip", or "vae".`);
}

// Extra scoring backends for multi-model cloak scoring: real backends of the
// same family for clip/vae, deterministic mock variants for mock (so CI can
// run without weights).
export function resolveScoreBackends(
  id: string | undefined,
  scoreModels: string[],
): EmbeddingBackend[] {
  const backendId = id ?? "mock";
  return scoreModels.map((scoreModel) => {
    if (backendId === "clip" || backendId === "transformers") {
      return createTransformersEmbeddingBackend({ model: scoreModel });
    }
    if (backendId === "vae") {
      return createVaeEmbeddingBackend({ model: scoreModel });
    }
    return createMockEmbeddingBackend(scoreModel);
  });
}
