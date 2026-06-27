import { writeFile } from "node:fs/promises";
import { renderHtmlReport, serializeReport, type AuditReport } from "@openartshield/core";
import { readImage, embedAndAudit, writeImage } from "@openartshield/node";
import { CliError } from "../utils/errors.js";
import { info, raw, success } from "../utils/output.js";

export type AuditOptions = {
  input: string;
  message: string;
  seed: number;
  strength?: number;
  repetitions?: number;
  out?: string;
  /** If set, also write a standalone HTML version of the report. */
  html?: string;
  /** If set, also dump the protected image we audited. */
  saveProtected?: string;
};

// Embed, run the default transform suite, hand back the report.
export async function runAuditCommand(options: AuditOptions): Promise<AuditReport> {
  if (!options.message) {
    throw new CliError("A non-empty --message is required.");
  }

  const image = await readImage(options.input);
  const { protectedImage, report } = await embedAndAudit(image, {
    message: options.message,
    seed: options.seed,
    imagePath: options.input,
    ...(options.strength !== undefined ? { strength: options.strength } : {}),
    ...(options.repetitions !== undefined ? { repetitions: options.repetitions } : {}),
  });

  if (options.saveProtected) {
    await writeImage(protectedImage, options.saveProtected);
  }
  if (options.out) {
    await writeFile(options.out, serializeReport(report), "utf-8");
  }
  if (options.html) {
    await writeFile(options.html, renderHtmlReport(report), "utf-8");
  }

  return report;
}

// With --out/--html we write files and print a one-line summary; with neither we
// dump the JSON to stdout so you can pipe it somewhere.
export async function auditCommand(options: AuditOptions): Promise<void> {
  const report = await runAuditCommand(options);

  if (options.out || options.html) {
    if (options.out) success(`Audit report written to ${options.out}`);
    if (options.html) success(`HTML report written to ${options.html}`);
    info(
      `Recovered ${report.summary.successfulRecoveries}/${report.summary.totalTransforms} transforms; ` +
        `average bit accuracy ${report.summary.averageBitAccuracy.toFixed(4)}.`,
    );
  } else {
    raw(serializeReport(report));
  }
}
