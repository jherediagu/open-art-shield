import { createMockEmbeddingBackend, type EmbeddingBackend } from "@openartshield/core";
import { createTransformersEmbeddingBackend } from "../ai/transformers-backend.js";

// Backend resolution shared by the SDK workflow functions. "mock" (default) is
// the deterministic placeholder; "clip"/"transformers" is the real CLIP backend
// (optional dependency, lazy-loaded).

export function resolveBackend(
  id: string | undefined,
  model: string | undefined,
): EmbeddingBackend {
  const backendId = id ?? "mock";
  if (backendId === "mock") return createMockEmbeddingBackend();
  if (backendId === "clip" || backendId === "transformers") {
    return createTransformersEmbeddingBackend(model !== undefined ? { model } : {});
  }
  throw new Error(`Unknown backend "${backendId}". Use "mock" (default) or "clip".`);
}

// Extra scoring backends for multi-model cloak scoring: real CLIP backends for
// clip, deterministic mock variants for mock (so tests run without weights).
export function resolveScoreBackends(
  id: string | undefined,
  scoreModels: string[],
): EmbeddingBackend[] {
  const backendId = id ?? "mock";
  return scoreModels.map((scoreModel) =>
    backendId === "clip" || backendId === "transformers"
      ? createTransformersEmbeddingBackend({ model: scoreModel })
      : createMockEmbeddingBackend(scoreModel),
  );
}

/** Strip the backend id down to a model name for display/reporting. */
export function modelFromBackendId(id: string): string {
  return id.startsWith("transformers:") ? id.slice("transformers:".length) : id;
}
