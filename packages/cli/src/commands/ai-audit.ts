import { serializeEmbeddingReport, type EmbeddingAuditReport } from "@openartshield/core";
import { aiAuditArtwork } from "@openartshield/node";
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
   * measurement), loaded with the same backend family (clip or vae). A
   * comparison model that fails to load fails the whole run - failed
   * comparisons are never silently skipped.
   */
  compareModels?: string[];
  prompt?: string;
  out?: string;
  html?: string;
};

// Thin wrapper over the @openartshield/node SDK (`aiAuditArtwork`): the CLI adds
// flag-specific validation text and owns terminal output.
export async function runAiAudit(options: AiAuditOptions): Promise<EmbeddingAuditReport> {
  const backendId = options.backend ?? "mock";
  const compareModels = options.compareModels ?? [];
  if (compareModels.length > 0 && backendId === "mock") {
    throw new CliError(
      "--compare-model requires a real backend (--backend clip or vae): transfer " +
        "measurement compares real embedding models, and the mock backend has nothing " +
        "to compare against.",
    );
  }

  return aiAuditArtwork(options.original, options.candidate, {
    backend: options.backend,
    model: options.model,
    compareModels: options.compareModels,
    prompt: options.prompt,
    jsonPath: options.out,
    htmlPath: options.html,
  });
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
