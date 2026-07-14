import { writeFile } from "node:fs/promises";
import {
  EOT_TRANSFORM_NAMES,
  renderCloakHtmlReport,
  resolveCloakOptimizer,
  resolveEotMode,
  runCloak,
  serializeCloakReport,
  type CloakReport,
} from "@openartshield/core";
import { defaultTransforms, readImage, selectTransforms, writeImage } from "@openartshield/node";
import { resolveEmbeddingBackend, resolveScoreBackends } from "../utils/backend.js";
import { failure, info, success } from "../utils/output.js";

export type CloakOptions = {
  input: string;
  out: string;
  backend?: string;
  model?: string;
  /**
   * Additional models used to score candidates (multi-model scoring). With the
   * clip backend each id loads another CLIP model (lazy, optional dependency);
   * with the mock backend each id creates a deterministic mock variant so the
   * flow can run in CI without model weights.
   */
  scoreModels?: string[];
  strength?: number;
  steps?: number;
  seed?: number;
  minPsnr?: number;
  maxSsimDrop?: number;
  /** EOT robustness mode: "none" (default), "mild", or "standard". */
  eot?: string;
  /** Candidate search strategy: "random" (default) or "greedy". */
  optimizer?: string;
  /** Fraction of pixels re-sampled per greedy mutation (default 0.1). */
  mutationRate?: number;
  report?: string;
  html?: string;
};

export type CloakRunResult = {
  report: CloakReport;
  /** Whether the cloaked image was written (only when a candidate improved drift). */
  wroteImage: boolean;
};

// Read -> search for a bounded perturbation that increases embedding drift ->
// (only if it improved) write the cloaked image -> write reports.
export async function runCloakCommand(options: CloakOptions): Promise<CloakRunResult> {
  const backend = resolveEmbeddingBackend(options.backend, options.model);
  // Resolve the EOT mode to its transform set (throws clearly on an unknown mode).
  const eotMode = resolveEotMode(options.eot ?? "none");
  const eotTransforms = selectTransforms([...EOT_TRANSFORM_NAMES[eotMode]]);
  // Validate the optimizer name (throws clearly on an unknown strategy).
  const optimizer = resolveCloakOptimizer(options.optimizer ?? "random");

  const scoreBackends = resolveScoreBackends(options.backend, options.scoreModels ?? []);

  const image = await readImage(options.input);

  const { image: cloaked, report } = await runCloak(backend, image, {
    transforms: defaultTransforms,
    eotMode,
    eotTransforms,
    scoreBackends,
    optimizer,
    inputPath: options.input,
    outputPath: options.out,
    ...(options.strength !== undefined ? { strength: options.strength } : {}),
    ...(options.steps !== undefined ? { steps: options.steps } : {}),
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    ...(options.minPsnr !== undefined ? { minPsnr: options.minPsnr } : {}),
    ...(options.maxSsimDrop !== undefined ? { maxSsimDrop: options.maxSsimDrop } : {}),
    ...(options.mutationRate !== undefined ? { mutationRate: options.mutationRate } : {}),
  });

  // Only write the image when we actually improved drift - never pass off the
  // unchanged original as a "cloak".
  const wroteImage = report.result.improved;
  if (wroteImage) {
    await writeImage(cloaked, options.out);
  }
  if (options.report) {
    await writeFile(options.report, serializeCloakReport(report), "utf-8");
  }
  if (options.html) {
    await writeFile(options.html, renderCloakHtmlReport(report), "utf-8");
  }

  return { report, wroteImage };
}

export async function cloakCommand(options: CloakOptions): Promise<void> {
  if ((options.backend ?? "mock") === "mock") {
    failure(
      "Using the 'mock' backend: it is a deterministic placeholder, not a perceptual " +
        "model, so cloaking against it is not meaningful. Use --backend clip for real runs.",
    );
  }

  const { report, wroteImage } = await runCloakCommand(options);
  const { parameters, result, eot, scoring, robustness } = report;

  info("Experimental cloak");
  info("");
  info(`Input: ${options.input}`);
  info(`Output: ${options.out}`);
  info(`Backend: ${report.backend.id}`);
  info(`Primary model: ${scoring.primaryModel}`);
  if (scoring.scoreModels.length > 0) {
    info(`Score models: ${scoring.scoreModels.join(", ")}`);
  }
  info(
    `EOT mode: ${eot.mode} (${eot.transforms.length} variant(s), ${eot.embeddingEvaluations} evals)`,
  );
  info(`Optimizer: ${parameters.optimizer}`);
  info(`Steps: ${parameters.steps}`);
  info(`Strength: ${parameters.strength}`);
  info("");
  info(`Initial drift: ${result.initialDrift.toFixed(4)}`);
  info(`Best drift (clean, primary): ${result.bestDrift.toFixed(4)}`);
  info(`Best aggregate drift: ${scoring.aggregateAverageDrift.toFixed(4)}`);
  info(`Weakest model drift: ${scoring.aggregateMinModelDrift.toFixed(4)}`);
  info(`Accepted improvements: ${result.acceptedImprovements}`);
  info(
    `EOT drift (primary) - clean: ${eot.cleanDrift.toFixed(4)}  avg: ${eot.averageDrift.toFixed(4)}  min: ${eot.minDrift.toFixed(4)}`,
  );
  info(
    `PSNR: ${result.psnr === null ? "-" : result.psnr.toFixed(2)}  SSIM: ${result.ssim.toFixed(4)}`,
  );
  info(`Mean drift after transforms: ${robustness.averageDriftAfterTransforms.toFixed(4)}`);
  info("");
  if (options.report) info(`Report: ${options.report}`);
  if (options.html) info(`HTML report: ${options.html}`);

  if (wroteImage) {
    success(`Cloaked image written to ${options.out}`);
    info("Note: a higher drift score is a measurement, not protection from AI.");
  } else {
    failure(
      "No candidate improved embedding drift within the quality guardrails - no image " +
        "was written. Try a higher --strength/--steps or a looser --min-psnr/--max-ssim-drop.",
    );
  }
}
