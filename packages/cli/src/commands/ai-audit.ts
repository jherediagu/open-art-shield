import { writeFile } from "node:fs/promises";
import {
  createMockEmbeddingBackend,
  renderEmbeddingHtmlReport,
  runEmbeddingAudit,
  serializeEmbeddingReport,
  type EmbeddingAuditReport,
  type EmbeddingBackend,
} from "@openartshield/core";
import { defaultTransforms, readImage } from "@openartshield/node";
import { CliError } from "../utils/errors.js";
import { failure, info, raw, success } from "../utils/output.js";

export type AiAuditOptions = {
  original: string;
  candidate: string;
  backend?: string;
  prompt?: string;
  out?: string;
  html?: string;
};

// Only the mock backend exists in this release. A real transformers.js backend
// is planned (PR2) and will register here behind the same EmbeddingBackend interface.
function resolveBackend(id: string | undefined): EmbeddingBackend {
  const backendId = id ?? "mock";
  if (backendId === "mock") return createMockEmbeddingBackend();
  throw new CliError(
    `Unknown backend "${backendId}". Only "mock" is available in this release; a ` +
      `real CLIP backend (transformers) is planned.`,
  );
}

export async function runAiAudit(options: AiAuditOptions): Promise<EmbeddingAuditReport> {
  const backend = resolveBackend(options.backend);
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
