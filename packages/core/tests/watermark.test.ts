import { describe, expect, it } from "vitest";
import { embedWatermark } from "../src/watermark/embed.js";
import { extractWatermark } from "../src/watermark/extract.js";
import { psnr } from "../src/metrics/quality.js";
import { CapacityError } from "../src/errors.js";
import { messageByteLength } from "../src/watermark/payload.js";
import type { WatermarkConfig } from "../src/types.js";
import { createSyntheticImage, countDifferences } from "./helpers.js";

const message = "artist=demo;license=no-ai-training";
const config: WatermarkConfig = {
  message,
  seed: 123,
  strength: 12,
  repetitions: 5,
};

// The watermark stores one payload bit per 8x8 block, so capacity is
// blocks / repetitions. A 38-byte payload (34-byte message + 4-byte checksum) at
// 5x repetition needs 1520 blocks, hence the relatively large test images.
describe("watermark embedding and extraction", () => {
  it("preserves image dimensions and channels", () => {
    const image = createSyntheticImage(384, 256, 3);
    const { image: protectedImage } = embedWatermark(image, config);
    expect(protectedImage.width).toBe(384);
    expect(protectedImage.height).toBe(256);
    expect(protectedImage.channels).toBe(3);
    expect(protectedImage.data.length).toBe(image.data.length);
  });

  it("recovers the message from an unmodified protected image", () => {
    const image = createSyntheticImage(384, 384, 3);
    const { image: protectedImage } = embedWatermark(image, config);

    const result = extractWatermark(protectedImage, {
      seed: config.seed,
      messageLength: messageByteLength(message),
      repetitions: config.repetitions,
    });

    expect(result.checksumValid).toBe(true);
    expect(result.recoveredMessage).toBe(message);
  });

  it("does not mutate the input image and produces a different output", () => {
    const image = createSyntheticImage(384, 384, 3);
    const snapshot = new Uint8ClampedArray(image.data);
    const { image: protectedImage } = embedWatermark(image, config);

    // Input untouched.
    expect(Array.from(image.data)).toEqual(Array.from(snapshot));
    // Output differs.
    expect(countDifferences(image, protectedImage)).toBeGreaterThan(0);
  });

  it("preserves the alpha channel when present", () => {
    const image = createSyntheticImage(384, 384, 4);
    // Make alpha non-trivial so we can verify it is carried through.
    for (let p = 0; p < image.width * image.height; p++) {
      image.data[p * 4 + 3] = (p * 7) % 256;
    }
    const alphaBefore = Array.from(image.data).filter((_, i) => i % 4 === 3);

    const { image: protectedImage } = embedWatermark(image, config);
    const alphaAfter = Array.from(protectedImage.data).filter((_, i) => i % 4 === 3);

    expect(alphaAfter).toEqual(alphaBefore);
  });

  it("recovers from a protected image with an alpha channel", () => {
    const image = createSyntheticImage(384, 384, 4);
    const { image: protectedImage } = embedWatermark(image, config);
    const result = extractWatermark(protectedImage, {
      seed: config.seed,
      messageLength: messageByteLength(message),
      repetitions: config.repetitions,
    });
    expect(result.recoveredMessage).toBe(message);
  });

  it("keeps the protected image visually close (high PSNR)", () => {
    const image = createSyntheticImage(384, 384, 3);
    const { image: protectedImage } = embedWatermark(image, config);
    expect(psnr(image, protectedImage)).toBeGreaterThan(30);
  });

  it("is deterministic for identical inputs", () => {
    const image = createSyntheticImage(384, 384, 3);
    const a = embedWatermark(image, config).image;
    const b = embedWatermark(image, config).image;
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it("fails extraction with the wrong seed", () => {
    const image = createSyntheticImage(384, 384, 3);
    const { image: protectedImage } = embedWatermark(image, config);
    const result = extractWatermark(protectedImage, {
      seed: config.seed + 1,
      messageLength: messageByteLength(message),
      repetitions: config.repetitions,
    });
    expect(result.recoveredMessage).not.toBe(message);
  });

  it("throws CapacityError when the payload does not fit", () => {
    const tiny = createSyntheticImage(32, 32, 3);
    expect(() =>
      embedWatermark(tiny, {
        message: "a very long message that will not fit into a tiny image at all",
        seed: 1,
        repetitions: 20,
      }),
    ).toThrow(CapacityError);
  });
});
