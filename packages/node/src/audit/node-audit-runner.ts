import {
  embedWatermark,
  runAudit,
  type AuditConfig,
  type AuditReport,
  type ImageTransform,
  type PixelImage,
} from "@openartshield/core";
import { defaultTransforms } from "../transforms/pipeline.js";

// Audit an image that's already been watermarked, using the default transforms.
export async function auditProtectedImage(
  protectedImage: PixelImage,
  config: AuditConfig,
  transforms: ImageTransform[] = defaultTransforms,
): Promise<AuditReport> {
  return runAudit(protectedImage, transforms, config);
}

// Embed then audit in one shot - this is what `oas audit` calls. Returns the
// protected image too in case you want to keep it.
export async function embedAndAudit(
  image: PixelImage,
  config: AuditConfig,
  transforms: ImageTransform[] = defaultTransforms,
): Promise<{ protectedImage: PixelImage; report: AuditReport }> {
  const { image: protectedImage } = embedWatermark(image, {
    message: config.message,
    seed: config.seed,
    ...(config.strength !== undefined ? { strength: config.strength } : {}),
    ...(config.repetitions !== undefined ? { repetitions: config.repetitions } : {}),
    ...(config.blockSize !== undefined ? { blockSize: config.blockSize } : {}),
    ...(config.coefficientA !== undefined ? { coefficientA: config.coefficientA } : {}),
    ...(config.coefficientB !== undefined ? { coefficientB: config.coefficientB } : {}),
  });

  const report = await runAudit(protectedImage, transforms, config);
  return { protectedImage, report };
}
