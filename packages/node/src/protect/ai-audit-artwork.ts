import { writeFile } from "node:fs/promises";
import {
  buildTransferComparison,
  buildTransferReport,
  renderEmbeddingHtmlReport,
  runEmbeddingAudit,
  serializeEmbeddingReport,
  type EmbeddingAuditReport,
  type TransferComparison,
} from "@openartshield/core";
import { readImage } from "../io/read-image.js";
import { defaultTransforms } from "../transforms/pipeline.js";
import { resolveBackend, modelFromBackendId } from "./backends.js";
import { createTransformersEmbeddingBackend } from "../ai/transformers-backend.js";

export type AiAuditArtworkOptions = {
  /** Embedding backend: "mock" (default) or "clip". */
  backend?: string;
  /** Model id for the clip backend (default Xenova/clip-vit-base-patch32). */
  model?: string;
  /**
   * Additional model ids for transfer measurement. Requires the clip backend. A
   * comparison model that fails to load fails the run - never silently skipped.
   */
  compareModels?: string[];
  /** Optional prompt for image<->text drift. */
  prompt?: string;
  /** Write the JSON report here when provided. */
  jsonPath?: string;
  /** Write the standalone HTML report here when provided. */
  htmlPath?: string;
};

/**
 * Measure the embedding drift between two image files (original vs. candidate),
 * optionally across additional models (transfer measurement), and optionally
 * write JSON/HTML reports.
 */
export async function aiAuditArtwork(
  originalPath: string,
  candidatePath: string,
  options: AiAuditArtworkOptions = {},
): Promise<EmbeddingAuditReport> {
  const backendId = options.backend ?? "mock";
  const compareModels = options.compareModels ?? [];
  if (compareModels.length > 0 && backendId !== "clip" && backendId !== "transformers") {
    throw new Error(
      "compareModels requires the clip backend: transfer measurement compares real " +
        "embedding models, and the mock backend has nothing to compare against.",
    );
  }

  const backend = resolveBackend(options.backend, options.model);
  const original = await readImage(originalPath);
  const candidate = await readImage(candidatePath);

  const report = await runEmbeddingAudit(backend, original, candidate, {
    transforms: defaultTransforms,
    originalPath,
    candidatePath,
    ...(options.prompt !== undefined ? { prompt: options.prompt } : {}),
  });

  // Transfer measurement: re-embed the same pair on each comparison model.
  if (compareModels.length > 0) {
    const comparisons: TransferComparison[] = [];
    for (const model of compareModels) {
      const compareBackend = createTransformersEmbeddingBackend({ model });
      const originalEmbedding = await compareBackend.embedImage(original);
      const candidateEmbedding = await compareBackend.embedImage(candidate);
      comparisons.push(
        buildTransferComparison(
          model,
          originalEmbedding,
          candidateEmbedding,
          report.embedding.drift,
        ),
      );
    }
    report.transfer = buildTransferReport(
      modelFromBackendId(backend.id),
      report.embedding.drift,
      comparisons,
    );
  }

  if (options.jsonPath) {
    await writeFile(options.jsonPath, serializeEmbeddingReport(report), "utf-8");
  }
  if (options.htmlPath) {
    await writeFile(options.htmlPath, renderEmbeddingHtmlReport(report), "utf-8");
  }

  return report;
}
