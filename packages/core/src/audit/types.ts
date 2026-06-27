import type { CoefficientPosition, PixelImage } from "../types.js";

export const REPORT_VERSION = "0.1.0";

/**
 * A named, deterministic transform used as an attack simulation. Core only
 * declares the shape - the actual JPEG/resize/blur implementations live in
 * @openartshield/node since they need real image codecs. apply() can be sync or
 * async and must not mutate its input.
 */
export type ImageTransform = {
  name: string;
  apply: (image: PixelImage) => PixelImage | Promise<PixelImage>;
};

/** What the audit expects to recover, plus the params used to embed it. */
export type AuditConfig = {
  message: string;
  seed: number;
  strength?: number;
  repetitions?: number;
  blockSize?: 8;
  coefficientA?: CoefficientPosition;
  coefficientB?: CoefficientPosition;
  /** Recorded in the report so you can trace where the image came from. */
  imagePath?: string;
};

/** Result of running one transform and trying to recover the watermark. */
export type AuditResult = {
  transform: string;
  recoveredMessage: string | null;
  messageRecovered: boolean;
  checksumValid: boolean;
  bitAccuracy: number;
  // psnr/ssim are null when the transform changed the dimensions (we can't
  // compare pixel-for-pixel against the original then).
  psnr: number | null;
  ssim: number | null;
};

export type AuditReport = {
  version: typeof REPORT_VERSION;
  image: {
    path?: string;
    width: number;
    height: number;
    channels: 3 | 4;
  };
  watermark: {
    expectedMessage: string;
    seed: number;
    strength: number;
    repetitions: number;
  };
  results: AuditResult[];
  summary: {
    totalTransforms: number;
    successfulRecoveries: number;
    averageBitAccuracy: number;
  };
};
