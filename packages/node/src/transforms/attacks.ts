import { Prng, clampByte, type ImageTransform, type PixelImage } from "@openartshield/core";
import { sharpToPixelImage, pixelImageToSharp } from "../io/sharp-utils.js";
import { jpegRoundTrip, resizeTo, toPixels } from "./util.js";

// Adversarial removal attacks: cheap, off-the-shelf operations shown in the
// literature to strip perturbation-based protections (Honig et al. ICLR 2025;
// IMPRESS NeurIPS 2023). These are deliberately simple CPU proxies for the
// published methods, not exact reproductions - enough to measure, honestly, how
// much of a cloak's embedding drift survives everyday removal.

// Deterministic additive Gaussian noise (Box-Muller), seeded so runs reproduce.
function addGaussianNoise(image: PixelImage, sigma: number, seed: number): PixelImage {
  const prng = new Prng(seed >>> 0);
  const { width, height, channels } = image;
  const out = new Uint8ClampedArray(image.data);
  for (let p = 0; p < width * height; p++) {
    const base = p * channels;
    for (let c = 0; c < 3; c++) {
      const u1 = Math.max(1e-9, prng.next());
      const u2 = prng.next();
      const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      out[base + c] = clampByte(out[base + c] + g * sigma);
    }
    // alpha (if any) is left untouched
  }
  return { width, height, channels, data: out };
}

/**
 * "Noisy upscaling" (Honig et al.): add Gaussian noise, then round-trip through
 * an upscaler. The upscaler's resampling reconstructs a clean-looking image while
 * discarding the fragile high-frequency perturbation. We use sharp's bicubic
 * resize as the upscaler proxy (no super-resolution model needed).
 */
export function noisyUpscale(
  sigma: number,
  scale: number,
  seed: number,
  name: string,
): ImageTransform {
  return {
    name,
    apply: async (image) => {
      const noisy = addGaussianNoise(image, sigma, seed);
      const up = await resizeTo(
        noisy,
        toPixels(image.width * scale),
        toPixels(image.height * scale),
        {
          kernel: "cubic",
        },
      );
      return resizeTo(up, image.width, image.height, { kernel: "cubic" });
    },
  };
}

/** Aggressive JPEG re-compression - lossy re-encoding erases weak perturbations. */
export function aggressiveJpeg(quality: number, name: string): ImageTransform {
  return { name, apply: (image) => jpegRoundTrip(image, quality) };
}

/**
 * Purification proxy: a strong Gaussian blur stands in for the diffusion/
 * autoencoder reconstruction that purifiers like IMPRESS use. It is an
 * image-processing approximation, NOT a real diffusion model - see the report
 * limitations.
 */
export function gaussianPurify(sigma: number, name: string): ImageTransform {
  return {
    name,
    apply: (image) => sharpToPixelImage(pixelImageToSharp(image).blur(sigma)),
  };
}

export const noisyUpscaleAttack = noisyUpscale(3, 2, 0x0a5c0a5c, "noisy_upscale");
export const jpegQuality50Attack = aggressiveJpeg(50, "jpeg_quality_50");
export const jpegQuality30Attack = aggressiveJpeg(30, "jpeg_quality_30");
export const gaussianPurifyAttack = gaussianPurify(1.5, "gaussian_purify");

// The default removal-attack suite for `oas attack`, roughly mildest -> harshest.
export const defaultAttacks: ImageTransform[] = [
  jpegQuality50Attack,
  jpegQuality30Attack,
  gaussianPurifyAttack,
  noisyUpscaleAttack,
];

export const attacksByName: Record<string, ImageTransform> = Object.fromEntries(
  defaultAttacks.map((a) => [a.name, a]),
);

export type AttackSetName = "none" | "standard";
export const ATTACK_SET_NAMES: readonly AttackSetName[] = ["none", "standard"];

export function isAttackSetName(value: string): value is AttackSetName {
  return (ATTACK_SET_NAMES as readonly string[]).includes(value);
}

/** Resolve an attack-set name to its attacks (throws clearly on an unknown set). */
export function resolveAttackSet(name: string): ImageTransform[] {
  if (!isAttackSetName(name)) {
    throw new Error(`Unknown attack set "${name}". Use one of: ${ATTACK_SET_NAMES.join(", ")}.`);
  }
  return name === "none" ? [] : [...defaultAttacks];
}
