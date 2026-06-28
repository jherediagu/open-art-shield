import { writeFile } from "node:fs/promises";
import { extname } from "node:path";
import {
  DEFAULT_REPETITIONS,
  DEFAULT_STRENGTH,
  buildSidecar,
  embedWatermark,
  estimateCapacity,
  messageByteLength,
  renderHtmlReport,
  serializeReport,
  serializeSidecar,
  type AuditReport,
  type SidecarMetadata,
} from "@openartshield/core";
import { auditProtectedImage, readImage, writeImage } from "@openartshield/node";
import { CliError } from "../utils/errors.js";
import { CLI_VERSION, info, success } from "../utils/output.js";

export type ProtectOptions = {
  input: string;
  message: string;
  seed: number;
  strength?: number;
  repetitions?: number;
  out: string;
  /** JSON report path. Defaults to <out-basename>.audit.json. */
  json?: string;
  /** HTML report path. Only written when provided. */
  html?: string;
  /** Sidecar path. Defaults to <out-basename>.openartshield.json. */
  sidecar?: string;
  /** Skip writing the sidecar entirely. */
  noSidecar?: boolean;
  /** Store the message inside the sidecar (off by default). */
  storeMessage?: boolean;
  /** ISO timestamp for the sidecar; injected for deterministic tests. */
  now?: string;
};

export type ProtectResult = {
  outPath: string;
  jsonPath: string;
  htmlPath?: string;
  sidecarPath?: string;
  report: AuditReport;
  sidecar?: SidecarMetadata;
  messageBytes: number;
};

/** Drop a path's extension and append `suffix`, e.g. protected.png -> protected.audit.json. */
function withSuffix(outPath: string, suffix: string): string {
  const ext = extname(outPath);
  const base = ext ? outPath.slice(0, -ext.length) : outPath;
  return base + suffix;
}

/**
 * The one-command workflow: capacity check -> embed -> audit -> reports -> sidecar.
 * Fails early (before embedding) if the message doesn't fit.
 */
export async function runProtect(options: ProtectOptions): Promise<ProtectResult> {
  if (!options.message) {
    throw new CliError("A non-empty --message is required.");
  }

  const repetitions = options.repetitions ?? DEFAULT_REPETITIONS;
  const strength = options.strength ?? DEFAULT_STRENGTH;
  const messageBytes = messageByteLength(options.message);

  const image = await readImage(options.input);

  // Capacity check first, so we never write a half-baked image.
  const capacity = estimateCapacity({
    width: image.width,
    height: image.height,
    messageByteLength: messageBytes,
    repetitions,
  });
  if (!capacity.fits) {
    throw new CliError(
      `Message does not fit: needs ${capacity.requiredBlocks} blocks but the image has ` +
        `${capacity.availableBlocks}. At ${repetitions}x repetitions the maximum message is ` +
        `${capacity.maxMessageBytes} bytes (got ${messageBytes}). Use a larger image, a shorter ` +
        `message, or fewer repetitions.`,
    );
  }

  const { image: protectedImage } = embedWatermark(image, {
    message: options.message,
    seed: options.seed,
    strength,
    repetitions,
  });
  await writeImage(protectedImage, options.out);

  const report = await auditProtectedImage(protectedImage, {
    message: options.message,
    seed: options.seed,
    strength,
    repetitions,
    imagePath: options.out,
  });

  const jsonPath = options.json ?? withSuffix(options.out, ".audit.json");
  await writeFile(jsonPath, serializeReport(report), "utf-8");

  let htmlPath: string | undefined;
  if (options.html) {
    htmlPath = options.html;
    await writeFile(htmlPath, renderHtmlReport(report), "utf-8");
  }

  let sidecarPath: string | undefined;
  let sidecar: SidecarMetadata | undefined;
  if (!options.noSidecar) {
    sidecar = buildSidecar({
      version: CLI_VERSION,
      seed: options.seed,
      messageLength: messageBytes,
      repetitions,
      strength,
      createdAt: options.now ?? new Date().toISOString(),
      originalFile: options.input,
      protectedFile: options.out,
      ...(options.storeMessage ? { message: options.message } : {}),
    });
    sidecarPath = options.sidecar ?? withSuffix(options.out, ".openartshield.json");
    await writeFile(sidecarPath, serializeSidecar(sidecar), "utf-8");
  }

  return { outPath: options.out, jsonPath, htmlPath, sidecarPath, report, sidecar, messageBytes };
}

export async function protectCommand(options: ProtectOptions): Promise<void> {
  const r = await runProtect(options);
  const { summary } = r.report;
  const failed = summary.totalTransforms - summary.successfulRecoveries;

  info("OpenArtShield protect");
  info("");
  info(`Input: ${options.input}`);
  info(`Output: ${r.outPath}`);
  info(`Message bytes: ${r.messageBytes}`);
  info("Capacity: OK");
  info(`Transforms tested: ${summary.totalTransforms}`);
  info(`Successful recoveries: ${summary.successfulRecoveries}`);
  info(`Failed recoveries: ${failed}`);
  info("");
  info(`JSON report: ${r.jsonPath}`);
  if (r.htmlPath) info(`HTML report: ${r.htmlPath}`);
  if (r.sidecarPath) info(`Sidecar: ${r.sidecarPath}`);
  success("Done.");
}
