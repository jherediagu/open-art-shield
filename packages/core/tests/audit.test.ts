import { describe, expect, it } from "vitest";
import { embedWatermark } from "../src/watermark/embed.js";
import { runAudit } from "../src/audit/runner.js";
import { clampByte } from "../src/utils/math.js";
import type { ImageTransform, AuditConfig } from "../src/audit/types.js";
import type { PixelImage } from "../src/types.js";
import { createSyntheticImage } from "./helpers.js";

const message = "artist=demo;license=no-ai-training";
const auditConfig: AuditConfig = {
  message,
  seed: 123,
  strength: 12,
  repetitions: 5,
  imagePath: "protected.png",
};

// A mild brightness shift that preserves dimensions.
const brightness: ImageTransform = {
  name: "brightness_test",
  apply: (image) => {
    const data = new Uint8ClampedArray(image.data);
    for (let i = 0; i < data.length; i++) {
      if (image.channels === 4 && i % 4 === 3) continue;
      data[i] = clampByte(data[i] + 2);
    }
    return { ...image, data };
  },
};

// A transform that changes dimensions, so PSNR/SSIM should be reported as null.
const halfSize: ImageTransform = {
  name: "half_size_test",
  apply: (image): PixelImage => {
    const w = Math.floor(image.width / 2);
    const h = Math.floor(image.height / 2);
    const out = new Uint8ClampedArray(w * h * image.channels);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const src = (y * 2 * image.width + x * 2) * image.channels;
        const dst = (y * w + x) * image.channels;
        for (let c = 0; c < image.channels; c++) out[dst + c] = image.data[src + c];
      }
    }
    return { width: w, height: h, channels: image.channels, data: out };
  },
};

describe("audit runner", () => {
  it("recovers the message under the identity transform", async () => {
    const image = createSyntheticImage(384, 384, 3);
    const { image: protectedImage } = embedWatermark(image, auditConfig);
    const report = await runAudit(protectedImage, [], auditConfig);

    const identity = report.results.find((r) => r.transform === "identity");
    expect(identity).toBeDefined();
    expect(identity?.messageRecovered).toBe(true);
    expect(identity?.checksumValid).toBe(true);
    expect(identity?.bitAccuracy).toBe(1);
    // Identical image => PSNR Infinity => reported as null; SSIM => 1.
    expect(identity?.psnr).toBeNull();
    expect(identity?.ssim).toBeCloseTo(1, 6);
  });

  it("produces a report matching the expected schema", async () => {
    const image = createSyntheticImage(384, 384, 3);
    const { image: protectedImage } = embedWatermark(image, auditConfig);
    const report = await runAudit(protectedImage, [brightness, halfSize], auditConfig);

    expect(report.version).toBe("0.1.0");
    expect(report.image).toEqual({
      path: "protected.png",
      width: 384,
      height: 384,
      channels: 3,
    });
    expect(report.watermark).toEqual({
      expectedMessage: message,
      seed: 123,
      strength: 12,
      repetitions: 5,
    });
    // identity + 2 transforms.
    expect(report.results).toHaveLength(3);
    for (const result of report.results) {
      expect(result).toHaveProperty("transform");
      expect(result).toHaveProperty("recoveredMessage");
      expect(result).toHaveProperty("messageRecovered");
      expect(result).toHaveProperty("checksumValid");
      expect(result).toHaveProperty("bitAccuracy");
      expect(result).toHaveProperty("psnr");
      expect(result).toHaveProperty("ssim");
    }
  });

  it("reports null quality metrics for dimension-changing transforms", async () => {
    const image = createSyntheticImage(384, 384, 3);
    const { image: protectedImage } = embedWatermark(image, auditConfig);
    const report = await runAudit(protectedImage, [halfSize], auditConfig);
    const half = report.results.find((r) => r.transform === "half_size_test");
    expect(half?.psnr).toBeNull();
    expect(half?.ssim).toBeNull();
  });

  it("computes summary values correctly", async () => {
    const image = createSyntheticImage(384, 384, 3);
    const { image: protectedImage } = embedWatermark(image, auditConfig);
    const report = await runAudit(protectedImage, [brightness], auditConfig);

    const expectedRecoveries = report.results.filter((r) => r.messageRecovered).length;
    const expectedAvg =
      report.results.reduce((s, r) => s + r.bitAccuracy, 0) / report.results.length;

    expect(report.summary.totalTransforms).toBe(report.results.length);
    expect(report.summary.successfulRecoveries).toBe(expectedRecoveries);
    expect(report.summary.averageBitAccuracy).toBeCloseTo(expectedAvg, 10);
  });
});
