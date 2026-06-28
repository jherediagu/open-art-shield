import { describe, expect, it } from "vitest";
import { cosineSimilarity, euclideanDistance, embeddingDrift } from "../src/ai/metrics.js";
import { createMockEmbeddingBackend } from "../src/ai/mock-backend.js";
import { runEmbeddingAudit } from "../src/ai/runner.js";
import { clampByte } from "../src/utils/math.js";
import type { ImageTransform } from "../src/audit/types.js";
import { createSyntheticImage } from "./helpers.js";

describe("embedding metrics", () => {
  it("cosine similarity hits the expected extremes", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
  });

  it("returns 0 cosine for a zero vector and drift mirrors cosine", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(embeddingDrift([1, 0], [1, 0])).toBeCloseTo(0, 10);
    expect(embeddingDrift([1, 0], [-1, 0])).toBeCloseTo(2, 10);
  });

  it("euclidean distance is 0 for identical vectors", () => {
    expect(euclideanDistance([1, 2, 3], [1, 2, 3])).toBe(0);
    expect(euclideanDistance([0, 0], [3, 4])).toBeCloseTo(5, 10);
  });

  it("throws on length mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1])).toThrow();
  });
});

describe("mock embedding backend", () => {
  const backend = createMockEmbeddingBackend();

  it("is deterministic and 64-dimensional", () => {
    const img = createSyntheticImage(96, 96, 3, 1);
    const a = backend.embedImage(img) as number[];
    const b = backend.embedImage(img) as number[];
    expect(a).toHaveLength(64);
    expect(a).toEqual(b);
  });

  it("gives identical embeddings for identical images and different for different ones", () => {
    const img1 = createSyntheticImage(96, 96, 3, 1);
    const img1b = createSyntheticImage(96, 96, 3, 1);
    const img2 = createSyntheticImage(96, 96, 3, 999);
    expect(
      cosineSimilarity(backend.embedImage(img1) as number[], backend.embedImage(img1b) as number[]),
    ).toBeCloseTo(1, 10);
    expect(
      cosineSimilarity(backend.embedImage(img1) as number[], backend.embedImage(img2) as number[]),
    ).toBeLessThan(0.9999);
  });

  it("embeds text deterministically", () => {
    const a = backend.embedText!("a photo") as number[];
    const b = backend.embedText!("a photo") as number[];
    const c = backend.embedText!("a painting") as number[];
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe("runEmbeddingAudit", () => {
  const backend = createMockEmbeddingBackend();

  const brighten: ImageTransform = {
    name: "brighten_test",
    apply: (image) => {
      const data = new Uint8ClampedArray(image.data);
      for (let i = 0; i < data.length; i++) {
        if (image.channels === 4 && i % 4 === 3) continue;
        data[i] = clampByte(data[i] + 10);
      }
      return { ...image, data };
    },
  };

  it("reports ~0 drift for identical images", async () => {
    const img = createSyntheticImage(96, 96, 3, 5);
    const report = await runEmbeddingAudit(backend, img, img);
    expect(report.backend).toBe("mock");
    expect(report.embedding.dimensions).toBe(64);
    expect(report.embedding.cosineSimilarity).toBeCloseTo(1, 6);
    expect(report.embedding.drift).toBeCloseTo(0, 6);
    expect(report.transforms).toHaveLength(0);
    expect(report.limitations.length).toBeGreaterThan(0);
  });

  it("reports positive drift for different images", async () => {
    const a = createSyntheticImage(96, 96, 3, 1);
    const b = createSyntheticImage(96, 96, 3, 999);
    const report = await runEmbeddingAudit(backend, a, b);
    expect(report.embedding.drift).toBeGreaterThan(0);
  });

  it("includes one result per transform with the expected fields", async () => {
    const img = createSyntheticImage(96, 96, 3, 7);
    const report = await runEmbeddingAudit(backend, img, img, { transforms: [brighten] });
    expect(report.transforms).toHaveLength(1);
    expect(report.summary.transformsTested).toBe(1);
    const r = report.transforms[0];
    expect(r.transform).toBe("brighten_test");
    expect(typeof r.cosineToOriginal).toBe("number");
    expect(r.drift).toBeCloseTo(1 - r.cosineToOriginal, 10);
    expect(r.psnr).not.toBeNull(); // brightness preserves dimensions
  });

  it("adds a prompt section when a prompt and text backend are present", async () => {
    const img = createSyntheticImage(96, 96, 3, 3);
    const report = await runEmbeddingAudit(backend, img, img, { prompt: "an illustration" });
    expect(report.prompt).toBeDefined();
    expect(report.prompt?.text).toBe("an illustration");
    // identical images => same similarity to the prompt => delta 0
    expect(report.prompt?.delta).toBeCloseTo(0, 10);
  });
});
