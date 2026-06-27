import { toLuminance } from "../image/color.js";
import { validatePixelImage } from "../image/validation.js";
import {
  DEFAULT_BLOCK_SIZE,
  DEFAULT_COEFFICIENT_A,
  DEFAULT_COEFFICIENT_B,
  DEFAULT_REPETITIONS,
} from "../types.js";
import type { PixelImage, WatermarkExtractionConfig, WatermarkExtractionResult } from "../types.js";
import { countBlocks, getCoefficient, readBlock, selectBlockOrder } from "./coefficients.js";
import { forwardDct } from "./dct.js";
import { decodePayload, repeatedBitLength } from "./payload.js";

/**
 * Pull a watermark back out of an image (assuming it was put there by
 * embedWatermark with the same params). One bit per slot: A > B reads as 1.
 * Then majority-vote the repeats and check the CRC; a failed checksum means we
 * return null rather than pretend we recovered something.
 */
export function extractWatermark(
  image: PixelImage,
  config: WatermarkExtractionConfig,
): WatermarkExtractionResult {
  validatePixelImage(image);

  const size = config.blockSize ?? DEFAULT_BLOCK_SIZE;
  const repetitions = config.repetitions ?? DEFAULT_REPETITIONS;
  const coefA = config.coefficientA ?? DEFAULT_COEFFICIENT_A;
  const coefB = config.coefficientB ?? DEFAULT_COEFFICIENT_B;

  const luma = toLuminance(image);
  const total = countBlocks(image.width, image.height, size);
  const order = selectBlockOrder(total, config.seed);

  const slotCount = Math.min(repeatedBitLength(config.messageLength, repetitions), total);

  const slotBits = new Array<number>(slotCount);
  for (let i = 0; i < slotCount; i++) {
    const block = readBlock(luma, image.width, order[i], size);
    const coeffs = forwardDct(block, size);
    const a = getCoefficient(coeffs, coefA, size);
    const b = getCoefficient(coeffs, coefB, size);
    slotBits[i] = a > b ? 1 : 0;
  }

  const { recoveredMessage, checksumValid, payloadBits } = decodePayload(
    slotBits,
    config.messageLength,
    repetitions,
  );

  return {
    recoveredMessage,
    checksumValid,
    rawBits: payloadBits,
  };
}
