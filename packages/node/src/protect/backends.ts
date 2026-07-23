import { createMockEmbeddingBackend, type EmbeddingBackend } from "@openartshield/core";
import { createTransformersEmbeddingBackend } from "../ai/transformers-backend.js";
import { createVaeEmbeddingBackend } from "../ai/vae-backend.js";

// Backend resolution shared by the SDK workflow functions. "mock" (default) is
// the deterministic placeholder; "clip"/"transformers" is the real CLIP backend;
// "vae" is the Stable Diffusion VAE-encoder backend (both optional
// dependencies, lazy-loaded).

export function resolveBackend(
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
  throw new Error(`Unknown backend "${backendId}". Use "mock" (default), "clip", or "vae".`);
}

// Extra scoring backends for multi-model cloak scoring: real backends of the
// same family for clip/vae, deterministic mock variants for mock (so tests run
// without weights).
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

/** Strip the backend id down to a model name for display/reporting. */
export function modelFromBackendId(id: string): string {
  if (id.startsWith("transformers:")) return id.slice("transformers:".length);
  if (id.startsWith("vae:")) return id.slice("vae:".length);
  return id;
}
