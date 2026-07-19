import type { PixelImage } from "../types.js";
import type { ImageTransform } from "../audit/types.js";

// Adversarial removal-attack audit.
//
// The published robustness studies (Honig et al. ICLR 2025; IMPRESS NeurIPS 2023;
// LightShed USENIX Sec 2025) show perturbation-based protections can be stripped
// by cheap, off-the-shelf attacks - noisy upscaling, aggressive JPEG, diffusion/
// autoencoder purification. This layer measures, honestly, how much of a cloak's
// embedding drift SURVIVES such an attack, instead of assuming it holds.
//
// An "attack" is just a named ImageTransform (the sharp-backed implementations
// live in @openartshield/node); core only declares the shapes and the pure
// survival math. This is a measurement, not a defense: a low survival ratio means
// the cloak was largely removed; a high one only means it resisted THESE attacks.

export const ATTACK_REPORT_VERSION = "0.1.0";

export type AttackAuditConfig = {
  /** Removal attacks applied to the cloaked image. */
  attacks?: ImageTransform[];
  /** Recorded in the report for traceability. */
  originalPath?: string;
  candidatePath?: string;
};

export type AttackResult = {
  attack: string;
  /** Embedding drift of the attacked image vs. the original. */
  driftAfter: number;
  /**
   * driftAfter / driftBefore: the fraction of the cloak's drift that survived
   * the attack. ~0 means the attack removed the cloak; ~1 means it resisted.
   * Null when the cloak produced no drift to begin with (driftBefore == 0).
   */
  survivalRatio: number | null;
  /** PSNR/SSIM of the attacked image vs. the cloaked image (how much the attack
   * changed the pixels). Null when the attack changed the dimensions. */
  psnr: number | null;
  ssim: number | null;
};

export type AttackAuditReport = {
  version: typeof ATTACK_REPORT_VERSION;
  backend: string;
  image: { original?: string; candidate?: string };
  /** Embedding drift of the cloaked image vs. the original, before any attack. */
  driftBefore: number;
  results: AttackResult[];
  summary: {
    attacksTested: number;
    /** Mean survival ratio across attacks (nulls excluded). */
    meanSurvivalRatio: number | null;
    /** Worst-case: the attack that removed the most drift. */
    minSurvivalRatio: number | null;
  };
  limitations: string[];
};

export const ATTACK_LIMITATIONS: readonly string[] = [
  "Survival is measured only against the attacks in this suite, under one backend.",
  "A high survival ratio does not prove protection; a low one shows removal.",
  "These attacks are cheap proxies for the published removal methods, not exact reproductions.",
  "The purification attack is an image-processing proxy, not a real diffusion model.",
  "Embedding drift is a measurement, not protection from AI training or style mimicry.",
];

/** A named removal attack. Alias of ImageTransform for intent; the sharp-backed
 * attacks live in @openartshield/node. */
export type RemovalAttack = ImageTransform;

export type { PixelImage };
