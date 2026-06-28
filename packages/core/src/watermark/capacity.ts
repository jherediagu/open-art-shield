import { DEFAULT_BLOCK_SIZE, DEFAULT_REPETITIONS } from "../types.js";
import { countBlocks } from "./coefficients.js";
import { payloadByteLength, repeatedBitLength } from "./payload.js";

// How much can we actually fit? The watermark stores one payload bit per 8x8
// block, so capacity is blocks / repetitions. This works it out (and the inverse
// question: how long a message fits) without touching any image data.

export type CapacityEstimate = {
  width: number;
  height: number;
  blockSize: number;
  /** Complete blockSize x blockSize blocks available in the image. */
  availableBlocks: number;
  messageBytes: number;
  /** Always 4 (CRC-32), surfaced for clarity in reports. */
  checksumBytes: number;
  /** Bits in one payload copy: (messageBytes + checksum) * 8. */
  payloadBits: number;
  repetitions: number;
  /** Blocks needed = payloadBits * repetitions. */
  requiredBlocks: number;
  /** Does the payload fit in availableBlocks? */
  fits: boolean;
  /** Longest message (in UTF-8 bytes) that still fits at these repetitions. */
  maxMessageBytes: number;
};

export type CapacityParams = {
  width: number;
  height: number;
  messageByteLength: number;
  repetitions?: number;
  blockSize?: 8;
};

export function estimateCapacity(params: CapacityParams): CapacityEstimate {
  const blockSize = params.blockSize ?? DEFAULT_BLOCK_SIZE;
  const repetitions = params.repetitions ?? DEFAULT_REPETITIONS;
  if (repetitions < 1 || !Number.isInteger(repetitions)) {
    throw new Error(`repetitions must be a positive integer, received ${repetitions}`);
  }

  const availableBlocks = countBlocks(params.width, params.height, blockSize);
  const payloadBytes = payloadByteLength(params.messageByteLength);
  const checksumBytes = payloadBytes - params.messageByteLength; // 4
  const payloadBits = payloadBytes * 8;
  const requiredBlocks = repeatedBitLength(params.messageByteLength, repetitions);

  // Invert requiredBlocks <= availableBlocks for the message length:
  // (msgBytes + checksum) * 8 * reps <= blocks.
  const payloadBytesThatFit = Math.floor(availableBlocks / (8 * repetitions));
  const maxMessageBytes = Math.max(0, payloadBytesThatFit - checksumBytes);

  return {
    width: params.width,
    height: params.height,
    blockSize,
    availableBlocks,
    messageBytes: params.messageByteLength,
    checksumBytes,
    payloadBits,
    repetitions,
    requiredBlocks,
    fits: requiredBlocks <= availableBlocks,
    maxMessageBytes,
  };
}
