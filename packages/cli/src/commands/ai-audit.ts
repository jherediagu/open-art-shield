import { writeFile } from "node:fs/promises";
import {
  renderEmbeddingHtmlReport,
  runEmbeddingAudit,
  serializeEmbeddingReport,
  type EmbeddingAuditReport,
} from "@openartshield/core";
import { defaultTransforms, readImage } from "@openartshield/node";
import { resolveEmbeddingBackend } from "../utils/backend.js";
import { failure, info, raw, success } from "../utils/output.js";

export type AiAuditOptions = {
  original: string;
  candidate: string;
  backend?: string;
  /** Model id for the transformers backend (default Xenova/clip-vit-base-patch32). */
  model?: string;
  prompt?: string;
  out?: string;
  html?: string;
};

export async function runAiAudit(options: AiAuditOptions): Promise<EmbeddingAuditReport> {
  const backend = resolveEmbeddingBackend(options.backend, options.model);
  const original = await readImage(options.original);
  const candidate = await readImage(options.candidate);

  const report = await runEmbeddingAudit(backend, original, candidate, {
    transforms: defaultTransforms,
    originalPath: options.original,
    candidatePath: options.candidate,
    ...(options.prompt !== undefined ? { prompt: options.prompt } : {}),
  });

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

  if (options.out || options.html) {
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
