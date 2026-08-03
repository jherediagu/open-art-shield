import { describe, expect, it } from "vitest";
import { embedWatermark, extractWatermark, type PixelImage } from "@openartshield/core";
import { imageDataFromPixelImage, pixelImageFromImageData } from "../src/image-data.js";
import { createTrustmarkWebDecoder, trustmarkInputFromImage } from "../src/trustmark-decoder.js";

// Everything here runs in Node: the converters and preprocessing are pure
// (they only need the {width, height, data} shape, not real DOM classes),
// and the canvas helpers are browser-only thin wrappers that we don't test
// in CI. onnxruntime-web is optional and intentionally not installed.

function makeTexturedImage(width: number, height: number): PixelImage {
  let state = 424242 >>> 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const data = new Uint8ClampedArray(width * height * 3);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.floor(((i / 3) % 200) * 0.7 + rand() * 80);
  }
  return { width, height, channels: 3, data };
}

describe("ImageData conversion", () => {
  it("round-trips RGBA pixels", () => {
    const rgba = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);
    const image = pixelImageFromImageData({ width: 2, height: 1, data: rgba });
    expect(image.channels).toBe(4);
    const back = imageDataFromPixelImage(image);
    expect(Array.from(back.data)).toEqual(Array.from(rgba));
  });

  it("copies the buffer instead of aliasing it", () => {
    const rgba = new Uint8ClampedArray([9, 9, 9, 255]);
    const image = pixelImageFromImageData({ width: 1, height: 1, data: rgba });
    rgba[0] = 0;
    expect(image.data[0]).toBe(9);
  });

  it("adds an opaque alpha channel to RGB images", () => {
    const rgb: PixelImage = {
      width: 1,
      height: 2,
      channels: 3,
      data: new Uint8ClampedArray([10, 20, 30, 40, 50, 60]),
    };
    const out = imageDataFromPixelImage(rgb);
    expect(Array.from(out.data)).toEqual([10, 20, 30, 255, 40, 50, 60, 255]);
  });

  it("rejects malformed buffers", () => {
    expect(() =>
      pixelImageFromImageData({ width: 2, height: 2, data: new Uint8ClampedArray(3) }),
    ).toThrow(/RGBA/);
  });
});

describe("core SDK through the browser package surface", () => {
  it("embeds and extracts a DCT watermark on converted ImageData pixels", () => {
    const source = makeTexturedImage(256, 256);
    // Simulate the browser flow: ImageData in, ImageData out.
    const asImageData = imageDataFromPixelImage(source);
    const image = pixelImageFromImageData(asImageData);

    const message = "web-demo";
    const { image: protectedImage } = embedWatermark(image, {
      message,
      seed: 7,
      strength: 16,
      repetitions: 5,
    });
    const extracted = extractWatermark(protectedImage, {
      seed: 7,
      messageLength: 8,
      repetitions: 5,
    });
    expect(extracted.checksumValid).toBe(true);
    expect(extracted.recoveredMessage).toBe(message);
  });
});

describe("trustmarkInputFromImage preprocessing", () => {
  it("packs a 256x256 NCHW tensor in [-1, 1]", () => {
    const input = trustmarkInputFromImage(makeTexturedImage(64, 48));
    expect(input.length).toBe(3 * 256 * 256);
    for (const value of input) {
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic", () => {
    const image = makeTexturedImage(32, 32);
    expect(trustmarkInputFromImage(image)).toEqual(trustmarkInputFromImage(image));
  });
});

describe("in-browser TrustMark decoder (optional dependency)", () => {
  it("fails with an install hint when 'onnxruntime-web' is absent", async () => {
    const decoder = createTrustmarkWebDecoder();
    await expect(decoder.decodeText(makeTexturedImage(64, 64))).rejects.toThrow(/onnxruntime-web/);
  });
});
