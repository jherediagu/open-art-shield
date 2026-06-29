import { createMockEmbeddingBackend, type EmbeddingBackend } from "@openartshield/core";
import { createTransformersEmbeddingBackend } from "@openartshield/node";
import { CliError } from "./errors.js";

// Resolve an embedding backend by id. "mock" (default) is a deterministic
// placeholder; "clip"/"transformers" is the real CLIP backend (optional dep).
export function resolveEmbeddingBackend(
  id: string | undefined,
  model: string | undefined,
): EmbeddingBackend {
  const backendId = id ?? "mock";
  if (backendId === "mock") return createMockEmbeddingBackend();
  if (backendId === "clip" || backendId === "transformers") {
    return createTransformersEmbeddingBackend(model !== undefined ? { model } : {});
  }
  throw new CliError(`Unknown backend "${backendId}". Use "mock" (default) or "clip".`);
}
