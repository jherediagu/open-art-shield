import { describe, expect, it } from "vitest";
import { psnr, ssim } from "../src/metrics/quality.js";
import { bitAccuracy } from "../src/metrics/recovery.js";
import { clonePixelImage } from "../src/image/clone.js";
import { createSyntheticImage } from "./helpers.js";

describe("quality metrics", () => {
  it("PSNR is Infinity for identical images", () => {
    const image = createSyntheticImage(64, 64, 3);
    expect(psnr(image, clonePixelImage(image))).toBe(Infinity);
  });

  it("PSNR decreases as distortion increases", () => {
    const image = createSyntheticImage(64, 64, 3);
    const mild = clonePixelImage(image);
    const heavy = clonePixelImage(image);
    for (let i = 0; i < mild.data.length; i += 3) mild.data[i] = clampByte(mild.data[i] + 2);
    for (let i = 0; i < heavy.data.length; i += 3) heavy.data[i] = clampByte(heavy.data[i] + 30);

    const mildPsnr = psnr(image, mild);
    const heavyPsnr = psnr(image, heavy);
    expect(mildPsnr).toBeGreaterThan(heavyPsnr);
    expect(mildPsnr).toBeGreaterThan(30);
  });

  it("SSIM is 1 for identical images", () => {
    const image = createSyntheticImage(64, 64, 3);
    expect(ssim(image, clonePixelImage(image))).toBeCloseTo(1, 6);
  });

  it("SSIM is below 1 for a distorted image and within range", () => {
    const image = createSyntheticImage(64, 64, 3);
    const distorted = clonePixelImage(image);
    for (let i = 0; i < distorted.data.length; i++) {
      distorted.data[i] = clampByte(distorted.data[i] + (i % 17) - 8);
    }
    const score = ssim(image, distorted);
    expect(score).toBeLessThan(1);
    expect(score).toBeGreaterThan(-1);
  });
});

describe("recovery metrics", () => {
  it("bitAccuracy is 1 for identical bit arrays", () => {
    expect(bitAccuracy([1, 0, 1, 1], [1, 0, 1, 1])).toBe(1);
  });

  it("bitAccuracy is 0.5 for half-matching arrays", () => {
    expect(bitAccuracy([1, 1, 0, 0], [1, 0, 0, 1])).toBe(0.5);
  });

  it("bitAccuracy returns 0 for empty input", () => {
    expect(bitAccuracy([], [])).toBe(0);
  });
});

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
