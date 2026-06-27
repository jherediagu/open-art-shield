// Shared types for the core SDK. Nothing here touches the filesystem or Node;
// everything works on raw pixel buffers so it can run anywhere.

/**
 * A raw, in-memory image.
 *
 * `data` is packed 8-bit channels in row-major order: RGB(RGB...) when
 * channels is 3, RGBA when it's 4. So data.length === width * height * channels.
 */
export type PixelImage = {
  width: number;
  height: number;
  channels: 3 | 4;
  data: Uint8ClampedArray;
};

/** `[row, column]` into an 8x8 coefficient block. */
export type CoefficientPosition = [number, number];

/**
 * Settings for embedding a watermark. Whatever you pass for seed / repetitions /
 * block size / coefficient positions has to be passed again on extraction,
 * otherwise the bits won't line up.
 */
export type WatermarkConfig = {
  message: string;
  seed: number;
  /** Higher = more robust but more visible. Defaults to DEFAULT_STRENGTH. */
  strength?: number;
  /** Per-bit repetition for majority voting. Trades capacity for robustness. */
  repetitions?: number;
  blockSize?: 8;
  coefficientA?: CoefficientPosition;
  coefficientB?: CoefficientPosition;
};

/**
 * Settings for extraction. Must mirror the embed config. `messageLength` is the
 * UTF-8 byte length of the original message - we need it to know how many bits
 * to read back.
 */
export type WatermarkExtractionConfig = {
  seed: number;
  messageLength: number;
  repetitions?: number;
  blockSize?: 8;
  coefficientA?: CoefficientPosition;
  coefficientB?: CoefficientPosition;
};

export type WatermarkEmbeddingResult = {
  /** Fresh image with the watermark. The input is left untouched. */
  image: PixelImage;
  bitsEmbedded: number;
  blocksUsed: number;
};

export type WatermarkExtractionResult = {
  /** Recovered message, or null when the checksum doesn't validate. */
  recoveredMessage: string | null;
  checksumValid: boolean;
  /** Only set when we have a reference message to compare against. */
  bitAccuracy?: number;
  /** Post-majority-vote payload bits, exposed mostly for diagnostics. */
  rawBits: number[];
};

// Defaults. Tweaked these a bit while testing on real photos; [3,1]/[1,3] gave
// the best robustness/quality balance for the mid-band coefficients.
export const DEFAULT_STRENGTH = 8;
export const DEFAULT_REPETITIONS = 5;
export const DEFAULT_BLOCK_SIZE = 8 as const;
export const DEFAULT_COEFFICIENT_A: CoefficientPosition = [3, 1];
export const DEFAULT_COEFFICIENT_B: CoefficientPosition = [1, 3];
