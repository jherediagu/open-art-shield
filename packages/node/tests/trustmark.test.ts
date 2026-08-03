import { describe, expect, it } from "vitest";
import { applyResidualToImage, createTrustmark, upscaleResidual } from "../src/index.js";
import { createSyntheticImage } from "./helpers.js";

// The ONNX models and 'onnxruntime-node' are optional (not installed in this
// repo; CI stays lean). These tests cover the pure pieces - residual
// upscaling, residual application, option validation - plus the missing-dep
// error. The full encode/decode roundtrip is exercised manually against the
// real models (see the v0.8 notes in roadmap.md).

describe("createTrustmark options", () => {
  it("defaults to the Q variant and BCH_5", () => {
    const tm = createTrustmark();
    expect(tm.variant).toBe("Q");
    expect(tm.version).toBe("BCH_5");
  });

  it("rejects unknown and unwired variants", () => {
    expect(() => createTrustmark({ variant: "X" as never })).toThrow(/Unknown TrustMark variant/);
    expect(() => createTrustmark({ variant: "P" })).toThrow(/only "Q" is supported/);
  });

  it("rejects out-of-range strengths", () => {
    expect(() => createTrustmark({ strength: 0 })).toThrow(/strength/);
    expect(() => createTrustmark({ strength: 1.2 })).toThrow(/strength/);
  });

  it("rejects extreme aspect ratios before touching the model", async () => {
    const tm = createTrustmark();
    await expect(tm.embedText(createSyntheticImage(300, 100, 3), "x")).rejects.toThrow(
      /aspect ratios/,
    );
  });

  it("fails with an install hint when 'onnxruntime-node' is absent", async () => {
    const tm = createTrustmark();
    await expect(tm.embedText(createSyntheticImage(64, 64, 3), "hello")).rejects.toThrow(
      /onnxruntime-node/,
    );
    await expect(tm.decodeText(createSyntheticImage(64, 64, 3))).rejects.toThrow(
      /onnxruntime-node/,
    );
  });
});

describe("upscaleResidual", () => {
  it("preserves a constant plane exactly", () => {
    const size = 4;
    const residual = new Float32Array(3 * size * size);
    residual.fill(0.125, 0, size * size); // channel 0
    residual.fill(-0.06, size * size, 2 * size * size); // channel 1
    const out = upscaleResidual(residual, size, 10, 6);
    expect(out.length).toBe(3 * 10 * 6);
    for (let i = 0; i < 10 * 6; i++) {
      expect(out[i]).toBeCloseTo(0.125, 6);
      expect(out[10 * 6 + i]).toBeCloseTo(-0.06, 6);
      expect(out[2 * 10 * 6 + i]).toBe(0);
    }
  });

  it("interpolates between neighboring cells", () => {
    const size = 2;
    // Channel 0: [[0, 1], [0, 1]] - a horizontal gradient.
    const residual = new Float32Array(3 * size * size);
    residual[1] = 1;
    residual[3] = 1;
    const out = upscaleResidual(residual, size, 4, 1);
    // Monotonically increasing across x.
    expect(out[0]).toBeLessThan(out[1]);
    expect(out[1]).toBeLessThanOrEqual(out[2]);
    expect(out[2]).toBeLessThan(out[3]);
  });
});

describe("applyResidualToImage", () => {
  it("moves bytes by residual * 127.5 and clamps", () => {
    const image = createSyntheticImage(2, 1, 3);
    image.data.set([100, 200, 250, 10, 20, 30]);
    // NCHW planes for a 2x1 image: c0=[r0,r1], c1=..., c2=...
    const residual = new Float32Array([0.2, -0.2, 0.2, 0.2, 0.2, -0.2]);
    const out = applyResidualToImage(image, residual);
    expect(out.data[0]).toBe(126); // 100 + 25.5 -> 125.5 rounds to 126
    expect(out.data[3]).toBe(0); // 10 - 25.5 clamps at 0
    expect(out.data[1]).toBe(226);
    expect(out.data[2]).toBe(255); // 250 + 25.5 clamps at 255
  });

  it("preserves alpha", () => {
    const image = createSyntheticImage(1, 1, 4);
    image.data.set([50, 60, 70, 123]);
    const residual = new Float32Array(3).fill(0.1);
    const out = applyResidualToImage(image, residual);
    expect(out.data[3]).toBe(123);
    expect(out.channels).toBe(4);
  });
});
