import { writeFile } from "node:fs/promises";
import {
  renderAttackHtmlReport,
  runAttackAudit,
  serializeAttackReport,
  type AttackAuditReport,
} from "@openartshield/core";
import { readImage, resolveAttackSet } from "@openartshield/node";
import { resolveEmbeddingBackend } from "../utils/backend.js";
import { failure, info, raw, success } from "../utils/output.js";

export type AttackOptions = {
  original: string;
  candidate: string;
  backend?: string;
  model?: string;
  /** Attack set: "standard" (default) or "none". */
  attacks?: string;
  out?: string;
  html?: string;
};

// Measure how much of a cloak's embedding drift survives a suite of removal
// attacks (noisy upscaling, aggressive JPEG, purification proxy). Lower survival
// means the cloak was largely stripped.
export async function runAttack(options: AttackOptions): Promise<AttackAuditReport> {
  const backend = resolveEmbeddingBackend(options.backend, options.model);
  // Throws clearly on an unknown attack set.
  const attacks = resolveAttackSet(options.attacks ?? "standard");

  const original = await readImage(options.original);
  const candidate = await readImage(options.candidate);

  const report = await runAttackAudit(backend, original, candidate, {
    attacks,
    originalPath: options.original,
    candidatePath: options.candidate,
  });

  if (options.out) {
    await writeFile(options.out, serializeAttackReport(report), "utf-8");
  }
  if (options.html) {
    await writeFile(options.html, renderAttackHtmlReport(report), "utf-8");
  }

  return report;
}

export async function attackCommand(options: AttackOptions): Promise<void> {
  const report = await runAttack(options);

  if (report.backend === "mock") {
    failure(
      "Using the 'mock' backend: a deterministic placeholder, not a perceptual model. " +
        "Survival numbers exercise the pipeline; they do not reflect a real model.",
    );
  }

  if (options.out || options.html) {
    info("OpenArtShield attack audit");
    info("");
    info(`Backend: ${report.backend}`);
    info(`Cloak drift (before attacks): ${report.driftBefore.toFixed(4)}`);
    for (const r of report.results) {
      info(
        `${r.attack}: drift ${r.driftAfter.toFixed(4)}  survival ` +
          `${r.survivalRatio === null ? "-" : r.survivalRatio.toFixed(2)}`,
      );
    }
    info(
      `Mean survival: ${report.summary.meanSurvivalRatio === null ? "-" : report.summary.meanSurvivalRatio.toFixed(2)}  ` +
        `worst-case: ${report.summary.minSurvivalRatio === null ? "-" : report.summary.minSurvivalRatio.toFixed(2)}`,
    );
    if (options.out) success(`Attack report written to ${options.out}`);
    if (options.html) success(`HTML report written to ${options.html}`);
    info("Note: low survival means the cloak was removed; this is a measurement, not protection.");
  } else {
    raw(serializeAttackReport(report));
  }
}
