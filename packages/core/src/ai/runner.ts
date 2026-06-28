import { psnr, ssim } from "../metrics/quality.js";
import { mean } from "../utils/math.js";
import type { PixelImage } from "../types.js";
import { cosineSimilarity, euclideanDistance } from "./metrics.js";
import {
  EMBEDDING_AUDIT_LIMITATIONS,
  EMBEDDING_REPORT_VERSION,
  type EmbeddingAuditConfig,
  type EmbeddingAuditReport,
  type EmbeddingBackend,
  type TransformDriftResult,
} from "./types.js";

/**
 * Measure how a model (via `backend`) "sees" two images: the embedding drift
 * between an original and a candidate, optionally how that drift holds up under a
 * set of transforms, and optionally image<->text prompt similarity.
 *
 * IO-free: transforms bring their own image processing, and the backend is
 * injected. Use the mock backend for tests; a real model for real numbers.
 */
export async function runEmbeddingAudit(
  backend: EmbeddingBackend,
  original: PixelImage,
  candidate: PixelImage,
  config: EmbeddingAuditConfig = {},
): Promise<EmbeddingAuditReport> {
  const originalEmbedding = await backend.embedImage(original);
  const candidateEmbedding = await backend.embedImage(candidate);

  const cosine = cosineSimilarity(originalEmbedding, candidateEmbedding);

  const transforms = config.transforms ?? [];
  const transformResults: TransformDriftResult[] = [];
  for (const transform of transforms) {
    const transformed = await transform.apply(candidate);
    const transformedEmbedding = await backend.embedImage(transformed);
    const cosineToOriginal = cosineSimilarity(originalEmbedding, transformedEmbedding);
    const sameShape =
      candidate.width === transformed.width && candidate.height === transformed.height;
    transformResults.push({
      transform: transform.name,
      cosineToOriginal,
      drift: 1 - cosineToOriginal,
      psnr: sameShape ? finiteOrNull(psnr(candidate, transformed)) : null,
      ssim: sameShape ? ssim(candidate, transformed) : null,
    });
  }

  const report: EmbeddingAuditReport = {
    version: EMBEDDING_REPORT_VERSION,
    backend: backend.id,
    image: {
      ...(config.originalPath !== undefined ? { original: config.originalPath } : {}),
      ...(config.candidatePath !== undefined ? { candidate: config.candidatePath } : {}),
    },
    embedding: {
      dimensions: originalEmbedding.length,
      cosineSimilarity: cosine,
      distance: euclideanDistance(originalEmbedding, candidateEmbedding),
      drift: 1 - cosine,
    },
    transforms: transformResults,
    summary: {
      transformsTested: transformResults.length,
      meanDriftAfterTransforms: mean(transformResults.map((r) => r.drift)),
    },
    limitations: EMBEDDING_AUDIT_LIMITATIONS,
  };

  // Optional prompt drift, only when the backend can embed text.
  if (config.prompt !== undefined && backend.embedText) {
    const textEmbedding = await backend.embedText(config.prompt);
    const originalSimilarity = cosineSimilarity(textEmbedding, originalEmbedding);
    const candidateSimilarity = cosineSimilarity(textEmbedding, candidateEmbedding);
    report.prompt = {
      text: config.prompt,
      originalSimilarity,
      candidateSimilarity,
      delta: candidateSimilarity - originalSimilarity,
    };
  }

  return report;
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}
