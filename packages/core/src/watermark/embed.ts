import { CapacityError } from "../errors.js";
import { applyLuminanceDelta, toLuminance } from "../image/color.js";
import { validatePixelImage } from "../image/validation.js";
import {
  DEFAULT_BLOCK_SIZE,
  DEFAULT_COEFFICIENT_A,
  DEFAULT_COEFFICIENT_B,
  DEFAULT_REPETITIONS,
  DEFAULT_STRENGTH,
} from "../types.js";
import type { PixelImage, WatermarkConfig, WatermarkEmbeddingResult } from "../types.js";
import {
  countBlocks,
  getCoefficient,
  readBlock,
  selectBlockOrder,
  setCoefficient,
  writeBlock,
} from "./coefficients.js";
import { forwardDct, inverseDct } from "./dct.js";
import { encodePayload } from "./payload.js";

/**
 * Embed an invisible watermark by reordering DCT coefficients.
 *
 * Each bit rides on the relative size of two mid-band coefficients in a
 * pseudo-randomly chosen 8x8 luminance block: bit 1 => A beats B by at least
 * `strength`, bit 0 => the other way around. We do this on luma and fold the
 * change back into RGB, leaving alpha alone. Returns a new image - the input is
 * never touched.
 */
export function embedWatermark(
  image: PixelImage,
  config: WatermarkConfig,
): WatermarkEmbeddingResult {
  validatePixelImage(image);

  const size = config.blockSize ?? DEFAULT_BLOCK_SIZE;
  const strength = config.strength ?? DEFAULT_STRENGTH;
  const repetitions = config.repetitions ?? DEFAULT_REPETITIONS;
  const coefA = config.coefficientA ?? DEFAULT_COEFFICIENT_A;
  const coefB = config.coefficientB ?? DEFAULT_COEFFICIENT_B;

  const { bits } = encodePayload(config.message, repetitions);

  const total = countBlocks(image.width, image.height, size);
  if (bits.length > total) {
    throw new CapacityError(
      `Payload requires ${bits.length} blocks but the image only provides ${total}. ` +
        `Reduce the message length or repetitions, or use a larger image.`,
    );
  }

  const originalLuma = toLuminance(image);
  const luma = new Float64Array(originalLuma);
  const order = selectBlockOrder(total, config.seed);

  for (let i = 0; i < bits.length; i++) {
    const blockIndex = order[i];
    const block = readBlock(luma, image.width, blockIndex, size);
    const coeffs = forwardDct(block, size);

    encodeBitIntoCoefficients(coeffs, bits[i], strength, coefA, coefB, size);

    const restored = inverseDct(coeffs, size);
    writeBlock(luma, image.width, blockIndex, size, restored);
  }

  const watermarked = applyLuminanceDelta(image, originalLuma, luma);

  return {
    image: watermarked,
    bitsEmbedded: bits.length,
    blocksUsed: bits.length,
  };
}

// Nudge the two coefficients so their ordering encodes `bit` with a `strength`
// gap. We only touch them when the existing gap is too small - leaving blocks
// that already encode the right bit alone keeps the distortion down.
function encodeBitIntoCoefficients(
  coeffs: number[],
  bit: number,
  strength: number,
  coefA: readonly [number, number],
  coefB: readonly [number, number],
  size: number,
): void {
  const a = getCoefficient(coeffs, coefA as [number, number], size);
  const b = getCoefficient(coeffs, coefB as [number, number], size);
  const mid = (a + b) / 2;
  const half = strength / 2;

  if (bit === 1) {
    if (a - b < strength) {
      setCoefficient(coeffs, coefA as [number, number], size, mid + half);
      setCoefficient(coeffs, coefB as [number, number], size, mid - half);
    }
  } else {
    if (b - a < strength) {
      setCoefficient(coeffs, coefA as [number, number], size, mid - half);
      setCoefficient(coeffs, coefB as [number, number], size, mid + half);
    }
  }
}
