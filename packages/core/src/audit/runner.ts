import { clonePixelImage } from "../image/clone.js";
import { psnr, ssim } from "../metrics/quality.js";
import { bitAccuracyForMessage, messageRecovered } from "../metrics/recovery.js";
import { DEFAULT_REPETITIONS, DEFAULT_STRENGTH } from "../types.js";
import type { PixelImage } from "../types.js";
import { extractWatermark } from "../watermark/extract.js";
import { messageByteLength } from "../watermark/payload.js";
import { buildSummary } from "./report.js";
import type { AuditConfig, AuditReport, AuditResult, ImageTransform } from "./types.js";
import { REPORT_VERSION } from "./types.js";

// identity baseline - always run first so the report has a "nothing happened"
// row to compare everything else against.
const IDENTITY: ImageTransform = {
  name: "identity",
  apply: (image) => clonePixelImage(image),
};

/**
 * Run an audit: for each transform, mangle the protected image, try to extract
 * the watermark again, and record how it went. An identity baseline is prepended
 * automatically. PSNR/SSIM only show up when the transform kept the dimensions
 * (otherwise there's nothing to compare pixel-for-pixel).
 *
 * No IO here - transforms bring their own image processing - so this happily
 * runs anywhere.
 */
export async function runAudit(
  protectedImage: PixelImage,
  transforms: ImageTransform[],
  config: AuditConfig,
): Promise<AuditReport> {
  const repetitions = config.repetitions ?? DEFAULT_REPETITIONS;
  const strength = config.strength ?? DEFAULT_STRENGTH;
  const expectedLength = messageByteLength(config.message);

  const allTransforms = [IDENTITY, ...transforms];
  const results: AuditResult[] = [];

  for (const transform of allTransforms) {
    const transformed = await transform.apply(protectedImage);
    results.push(
      evaluateResult(
        transform.name,
        protectedImage,
        transformed,
        config,
        repetitions,
        expectedLength,
      ),
    );
  }

  return {
    version: REPORT_VERSION,
    image: {
      ...(config.imagePath !== undefined ? { path: config.imagePath } : {}),
      width: protectedImage.width,
      height: protectedImage.height,
      channels: protectedImage.channels,
    },
    watermark: {
      expectedMessage: config.message,
      seed: config.seed,
      strength,
      repetitions,
    },
    results,
    summary: buildSummary(results),
  };
}

// Extract + score one transformed image.
function evaluateResult(
  name: string,
  reference: PixelImage,
  transformed: PixelImage,
  config: AuditConfig,
  repetitions: number,
  expectedLength: number,
): AuditResult {
  const extraction = extractWatermark(transformed, {
    seed: config.seed,
    messageLength: expectedLength,
    repetitions,
    ...(config.blockSize !== undefined ? { blockSize: config.blockSize } : {}),
    ...(config.coefficientA !== undefined ? { coefficientA: config.coefficientA } : {}),
    ...(config.coefficientB !== undefined ? { coefficientB: config.coefficientB } : {}),
  });

  const sameShape =
    reference.width === transformed.width && reference.height === transformed.height;

  return {
    transform: name,
    recoveredMessage: extraction.recoveredMessage,
    messageRecovered: messageRecovered(config.message, extraction.recoveredMessage),
    checksumValid: extraction.checksumValid,
    bitAccuracy: bitAccuracyForMessage(config.message, extraction.rawBits, repetitions),
    psnr: sameShape ? finiteOrNull(psnr(reference, transformed)) : null,
    ssim: sameShape ? ssim(reference, transformed) : null,
  };
}

// PSNR is Infinity for an identical image; report that as null in the JSON.
function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}
