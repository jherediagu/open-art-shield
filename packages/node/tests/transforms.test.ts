import { describe, expect, it } from "vitest";
import {
  embedWatermark,
  extractWatermark,
  messageByteLength,
  type WatermarkConfig,
} from "@openartshield/core";
import { defaultTransforms, jpegQuality95 } from "../src/index.js";
import { createSyntheticImage } from "./helpers.js";

describe("transforms", () => {
  it("all default transforms preserve dimensions (audit mode)", async () => {
    const image = createSyntheticImage(128, 96, 3);
    for (const transform of defaultTransforms) {
      const out = await transform.apply(image);
      expect(out.width, `${transform.name} width`).toBe(128);
      expect(out.height, `${transform.name} height`).toBe(96);
    }
  });

  it("all default transforms are deterministic", async () => {
    const image = createSyntheticImage(96, 96, 3);
    for (const transform of defaultTransforms) {
      const a = await transform.apply(image);
      const b = await transform.apply(image);
      expect(Array.from(a.data), `${transform.name} determinism`).toEqual(Array.from(b.data));
    }
  });

  it("have unique, stable names", () => {
    const names = defaultTransforms.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("jpeg_quality_85");
    expect(names).toContain("screenshot_simulation");
  });

  it("JPEG quality 95 preserves recoverability on a textured image", async () => {
    const image = createSyntheticImage(384, 384, 3);
    const config: WatermarkConfig = {
      message: "artist=demo;license=no-ai-training",
      seed: 123,
      strength: 18,
      repetitions: 5,
    };
    const { image: protectedImage } = embedWatermark(image, config);
    const transformed = await jpegQuality95.apply(protectedImage);

    const result = extractWatermark(transformed, {
      seed: config.seed,
      messageLength: messageByteLength(config.message),
      repetitions: config.repetitions,
    });
    expect(result.recoveredMessage).toBe(config.message);
  });
});
