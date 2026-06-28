import { writeFile } from "node:fs/promises";
import {
  renderCloakHtmlReport,
  runCloak,
  serializeCloakReport,
  type CloakReport,
} from "@openartshield/core";
import { defaultTransforms, readImage, writeImage } from "@openartshield/node";
import { resolveEmbeddingBackend } from "../utils/backend.js";
import { failure, info, success } from "../utils/output.js";

export type CloakOptions = {
  input: string;
  out: string;
  backend?: string;
  model?: string;
  strength?: number;
  steps?: number;
  seed?: number;
  minPsnr?: number;
  maxSsimDrop?: number;
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
  const image = await readImage(options.input);

  const { image: cloaked, report } = await runCloak(backend, image, {
    transforms: defaultTransforms,
    inputPath: options.input,
    outputPath: options.out,
    ...(options.strength !== undefined ? { strength: options.strength } : {}),
    ...(options.steps !== undefined ? { steps: options.steps } : {}),
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    ...(options.minPsnr !== undefined ? { minPsnr: options.minPsnr } : {}),
    ...(options.maxSsimDrop !== undefined ? { maxSsimDrop: options.maxSsimDrop } : {}),
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
  const { result, robustness } = report;

  info("OpenArtShield cloak (experimental)");
  info("");
  info(`Input: ${options.input}`);
  info(`Backend: ${report.backend.id}`);
  info(`Initial drift: ${result.initialDrift.toFixed(4)}`);
  info(`Best drift: ${result.bestDrift.toFixed(4)}`);
  info(
    `PSNR: ${result.psnr === null ? "-" : result.psnr.toFixed(2)}  SSIM: ${result.ssim.toFixed(4)}`,
  );
  info(`Mean drift after transforms: ${robustness.averageDriftAfterTransforms.toFixed(4)}`);
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
