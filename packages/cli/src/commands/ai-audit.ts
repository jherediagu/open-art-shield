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
import {
  createTransformersEmbeddingBackend,
  defaultTransforms,
  readImage,
} from "@openartshield/node";
import { resolveEmbeddingBackend } from "../utils/backend.js";
import { CliError } from "../utils/errors.js";
import { failure, info, raw, success } from "../utils/output.js";

export type AiAuditOptions = {
  original: string;
  candidate: string;
  backend?: string;
  /** Model id for the transformers backend (default Xenova/clip-vit-base-patch32). */
  model?: string;
  /**
   * Additional model ids to measure the same image pair on (transfer
   * measurement). Requires the clip backend. A comparison model that fails to
   * load fails the whole run - failed comparisons are never silently skipped.
   */
  compareModels?: string[];
  prompt?: string;
  out?: string;
  html?: string;
};

/** Strip the backend id down to a model name for display/reporting. */
function modelFromBackendId(id: string): string {
  return id.startsWith("transformers:") ? id.slice("transformers:".length) : id;
}

export async function runAiAudit(options: AiAuditOptions): Promise<EmbeddingAuditReport> {
  const backendId = options.backend ?? "mock";
  const compareModels = options.compareModels ?? [];
  if (compareModels.length > 0 && backendId !== "clip" && backendId !== "transformers") {
    throw new CliError(
      "--compare-model requires --backend clip: transfer measurement compares real " +
        "embedding models, and the mock backend has nothing to compare against.",
    );
  }

  const backend = resolveEmbeddingBackend(options.backend, options.model);
  const original = await readImage(options.original);
  const candidate = await readImage(options.candidate);

  const report = await runEmbeddingAudit(backend, original, candidate, {
    transforms: defaultTransforms,
    originalPath: options.original,
    candidatePath: options.candidate,
    ...(options.prompt !== undefined ? { prompt: options.prompt } : {}),
  });

  // Transfer measurement: re-embed the same pair on each comparison model. A
  // model that fails to load throws and fails the run - no silent skips.
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

  if (options.out) {
    await writeFile(options.out, serializeEmbeddingReport(report), "utf-8");
  }
  if (options.html) {
    await writeFile(options.html, renderEmbeddingHtmlReport(report), "utf-8");
  }

  return report;
}

export async function aiAuditCommand(options: AiAuditOptions): Promise<void> {
  const report = await runAiAudit(options);

  // Loudly flag the placeholder backend so nobody mistakes mock numbers for real ones.
  if (report.backend === "mock") {
    failure(
      "Using the 'mock' backend: a deterministic downsampled-luma feature, NOT a real " +
        "perceptual model. These numbers exercise the pipeline; they do not reflect how a " +
        "real model sees the image.",
    );
  }

  if (options.out || options.html || report.transfer) {
    if (report.transfer) {
      info("AI audit");
      info("");
      info(`Primary model: ${report.transfer.primaryModel}`);
      info(`Primary drift: ${report.transfer.summary.primaryDrift.toFixed(4)}`);
      for (const comparison of report.transfer.comparisons) {
        info("");
        info(`Transfer model: ${comparison.model}`);
        info(`Transfer drift: ${comparison.drift.toFixed(4)}`);
        info(
          `Transfer ratio: ${comparison.transferRatio === null ? "-" : comparison.transferRatio.toFixed(2)}`,
        );
      }
      info("");
    }
    if (options.out) success(`AI-audit report written to ${options.out}`);
    if (options.html) success(`HTML report written to ${options.html}`);
    info(
      `Backend: ${report.backend}; cosine ${report.embedding.cosineSimilarity.toFixed(4)}, ` +
        `drift ${report.embedding.drift.toFixed(4)}, mean drift after transforms ` +
        `${report.summary.meanDriftAfterTransforms.toFixed(4)}.`,
    );
  } else {
    raw(serializeEmbeddingReport(report));
  }
}
