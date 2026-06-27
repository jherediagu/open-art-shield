import { describe, expect, it } from "vitest";
import { estimateCapacity } from "../src/watermark/capacity.js";
import { embedWatermark } from "../src/watermark/embed.js";
import { messageByteLength } from "../src/watermark/payload.js";
import { CapacityError } from "../src/errors.js";
import { createSyntheticImage } from "./helpers.js";

const message = "artist=demo;license=no-ai-training"; // 34 bytes

describe("estimateCapacity", () => {
  it("matches the documented 384x384 example", () => {
    const c = estimateCapacity({
      width: 384,
      height: 384,
      messageByteLength: messageByteLength(message),
      repetitions: 5,
    });
    expect(c.availableBlocks).toBe(2304); // 48 * 48
    expect(c.messageBytes).toBe(34);
    expect(c.checksumBytes).toBe(4);
    expect(c.payloadBits).toBe(304); // (34 + 4) * 8
    expect(c.requiredBlocks).toBe(1520); // 304 * 5
    expect(c.fits).toBe(true);
  });

  it("reports insufficient capacity for a tiny image", () => {
    const c = estimateCapacity({
      width: 64,
      height: 64,
      messageByteLength: messageByteLength(message),
      repetitions: 5,
    });
    expect(c.availableBlocks).toBe(64); // 8 * 8
    expect(c.fits).toBe(false);
    expect(c.requiredBlocks).toBeGreaterThan(c.availableBlocks);
  });

  it("maxMessageBytes is consistent with what actually fits", () => {
    const width = 256;
    const height = 256;
    const repetitions = 5;
    const c = estimateCapacity({ width, height, messageByteLength: 0, repetitions });

    // A message exactly at the limit should fit; one byte more should not.
    const atLimit = estimateCapacity({
      width,
      height,
      messageByteLength: c.maxMessageBytes,
      repetitions,
    });
    const overLimit = estimateCapacity({
      width,
      height,
      messageByteLength: c.maxMessageBytes + 1,
      repetitions,
    });
    expect(atLimit.fits).toBe(true);
    expect(overLimit.fits).toBe(false);
  });

  it("agrees with the embedder: a message at the limit embeds, over it throws", () => {
    const image = createSyntheticImage(256, 256, 3);
    const repetitions = 5;
    const c = estimateCapacity({ width: 256, height: 256, messageByteLength: 0, repetitions });

    const fitting = "a".repeat(c.maxMessageBytes);
    expect(() => embedWatermark(image, { message: fitting, seed: 1, repetitions })).not.toThrow();

    const tooBig = "a".repeat(c.maxMessageBytes + 1);
    expect(() => embedWatermark(image, { message: tooBig, seed: 1, repetitions })).toThrow(
      CapacityError,
    );
  });

  it("rejects an invalid repetition count", () => {
    expect(() =>
      estimateCapacity({ width: 128, height: 128, messageByteLength: 10, repetitions: 0 }),
    ).toThrow();
  });
});
