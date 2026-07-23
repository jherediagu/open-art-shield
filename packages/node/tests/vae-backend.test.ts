import { describe, expect, it } from "vitest";
import { createVaeEmbeddingBackend, vaeInputFromImage } from "../src/index.js";
import { createSyntheticImage } from "./helpers.js";

// The VAE backend depends on the optional 'onnxruntime-node' package, which is
// intentionally NOT installed in this repo (CI stays on the deterministic mock
// backend). These tests cover the parts that don't need the model: a stable id,
// input validation, the pure preprocessing, and a clear error when the optional
// dependency is missing.

describe("vae embedding backend (optional dependency)", () => {
  it("exposes a stable id that includes the model", () => {
    const backend = createVaeEmbeddingBackend({
      model: "onnx-community/stable-diffusion-v1-5-ONNX",
    });
    expect(backend.id).toBe("vae:onnx-community/stable-diffusion-v1-5-ONNX");
  });

  it("defaults the model id", () => {
    expect(createVaeEmbeddingBackend().id).toBe("vae:onnx-community/stable-diffusion-v1-5-ONNX");
  });

  it("rejects encode sizes that are not multiples of 8", () => {
    expect(() => createVaeEmbeddingBackend({ size: 100 })).toThrow(/multiple of 8/);
    expect(() => createVaeEmbeddingBackend({ size: 0 })).toThrow(/multiple of 8/);
  });

  it("fails with a helpful error when 'onnxruntime-node' is absent", async () => {
    const backend = createVaeEmbeddingBackend();
    await expect(backend.embedImage(createSyntheticImage(32, 32, 3))).rejects.toThrow(
      /onnxruntime-node/,
    );
  });
});

describe("vaeInputFromImage preprocessing", () => {
  it("packs a NCHW float32 tensor of the requested size", () => {
    const input = vaeInputFromImage(createSyntheticImage(32, 24, 3), 16);
    expect(input).toBeInstanceOf(Float32Array);
    expect(input.length).toBe(3 * 16 * 16);
  });

  it("normalizes pixel values into [-1, 1]", () => {
    const input = vaeInputFromImage(createSyntheticImage(32, 32, 3), 16);
    for (const value of input) {
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("maps black to -1 and white to +1", () => {
    const black = createSyntheticImage(8, 8, 3);
    black.data.fill(0);
    const white = createSyntheticImage(8, 8, 3);
    white.data.fill(255);
    expect(Array.from(vaeInputFromImage(black, 8)).every((v) => v === -1)).toBe(true);
    expect(Array.from(vaeInputFromImage(white, 8)).every((v) => v === 1)).toBe(true);
  });

  it("is deterministic", () => {
    const image = createSyntheticImage(20, 20, 3);
    expect(vaeInputFromImage(image, 16)).toEqual(vaeInputFromImage(image, 16));
  });

  it("ignores the alpha channel of RGBA images", () => {
    const rgb = createSyntheticImage(16, 16, 3);
    const rgba = createSyntheticImage(16, 16, 4);
    for (let i = 0; i < 16 * 16; i++) {
      for (let c = 0; c < 3; c++) rgba.data[i * 4 + c] = rgb.data[i * 3 + c];
      rgba.data[i * 4 + 3] = 128;
    }
    expect(vaeInputFromImage(rgba, 8)).toEqual(vaeInputFromImage(rgb, 8));
  });

  it("is sensitive to image content", () => {
    const a = createSyntheticImage(16, 16, 3);
    const b = createSyntheticImage(16, 16, 3);
    b.data[0] = (b.data[0] + 128) % 256;
    expect(vaeInputFromImage(a, 16)).not.toEqual(vaeInputFromImage(b, 16));
  });
});
