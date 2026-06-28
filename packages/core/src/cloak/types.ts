import type { PixelImage } from "../types.js";
import type { ImageTransform } from "../audit/types.js";

// Experimental embedding cloak.
//
// This is NOT Glaze/Nightshade and NOT AI-proof protection. It is a small,
// honest prototype: generate a visually-bounded perturbation that increases
// embedding drift under a chosen backend, and measure whether it survives the
// transform suite. A higher drift score only means the selected backend changed
// more under the measured conditions - nothing more.

export const CLOAK_REPORT_VERSION = "0.1.0";

export const DEFAULT_CLOAK_STRENGTH = 4;
export const DEFAULT_CLOAK_STEPS = 8;
export const DEFAULT_CLOAK_SEED = 123;
export const DEFAULT_CLOAK_MIN_PSNR = 38;
export const DEFAULT_CLOAK_MAX_SSIM_DROP = 0.02;

export const CLOAK_LIMITATIONS: readonly string[] = [
  "This is an experimental embedding-space perturbation.",
  "It does not prevent AI training.",
  "It does not guarantee style protection.",
  "It is not Glaze, Nightshade, or a reproduction of those papers.",
  "CLIP is only one proxy model; results do not generalize to all systems.",
  "A higher embedding drift score is a measurement, not a guarantee.",
];

export type CloakConfig = {
  /** Max absolute per-channel pixel change a candidate may apply. */
  strength?: number;
  /** Number of candidate perturbations to try. */
  steps?: number;
  /** Seed for the deterministic candidate generator. */
  seed?: number;
  /** Reject candidates whose PSNR (vs. original) is below this. */
  minPsnr?: number;
  /** Reject candidates whose SSIM (vs. original) drops more than this below 1. */
  maxSsimDrop?: number;
  /** Transforms used to measure whether the cloak survives (robustness). */
  transforms?: ImageTransform[];
  inputPath?: string;
  outputPath?: string;
};

export type CloakReport = {
  version: typeof CLOAK_REPORT_VERSION;
  input: { path?: string; width: number; height: number };
  output: { path?: string };
  backend: { id: string; model?: string };
  parameters: {
    strength: number;
    steps: number;
    seed: number;
    minPsnr: number;
    maxSsimDrop: number;
  };
  result: {
    /** Whether any candidate beat the original's drift while passing quality limits. */
    improved: boolean;
    initialDrift: number;
    bestDrift: number;
    /** Quality of the chosen image vs. the original. psnr is null when unchanged. */
    psnr: number | null;
    ssim: number;
    /** How many candidates were rejected by the quality guardrails. */
    candidatesRejected: number;
  };
  robustness: {
    transformsTested: number;
    averageDriftAfterTransforms: number;
  };
  limitations: string[];
};

export type CloakResult = {
  /** The chosen image. Equals the original when `report.result.improved` is false. */
  image: PixelImage;
  report: CloakReport;
};
