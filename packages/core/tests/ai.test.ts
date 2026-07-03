import { describe, expect, it } from "vitest";
import { cosineSimilarity, euclideanDistance, embeddingDrift } from "../src/ai/metrics.js";
import { createMockEmbeddingBackend } from "../src/ai/mock-backend.js";
import { runEmbeddingAudit } from "../src/ai/runner.js";
import { serializeEmbeddingReport, renderEmbeddingHtmlReport } from "../src/ai/report.js";
import { buildTransferComparison, buildTransferReport, transferRatio } from "../src/ai/transfer.js";
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

describe("transfer measurement", () => {
  const backend = createMockEmbeddingBackend();

  it("computes the transfer ratio and returns null when primary drift is zero", () => {
    expect(transferRatio(0.1, 0.08)).toBeCloseTo(0.8, 10);
    expect(transferRatio(0.1, 0)).toBe(0);
    expect(transferRatio(0, 0.05)).toBeNull();
    expect(transferRatio(0, 0)).toBeNull();
  });

  it("builds a comparison from an embedding pair", () => {
    const original = [1, 0, 0];
    const candidate = [0, 1, 0]; // orthogonal => cosine 0, drift 1
    const c = buildTransferComparison("model-b", original, candidate, 0.5);
    expect(c.model).toBe("model-b");
    expect(c.cosineSimilarity).toBeCloseTo(0, 10);
    expect(c.drift).toBeCloseTo(1, 10);
    expect(c.transferRatio).toBeCloseTo(2, 10);
  });

  it("builds a transfer report with average and minimum drift", () => {
    const comparisons = [
      buildTransferComparison("m1", [1, 0], [1, 0], 0.1), // drift 0
      buildTransferComparison("m2", [1, 0], [0, 1], 0.1), // drift 1
    ];
    const t = buildTransferReport("primary-model", 0.1, comparisons);
    expect(t.primaryModel).toBe("primary-model");
    expect(t.summary.primaryDrift).toBe(0.1);
    expect(t.summary.averageTransferDrift).toBeCloseTo(0.5, 10);
    expect(t.summary.minimumTransferDrift).toBeCloseTo(0, 10);
    expect(t.limitations.length).toBeGreaterThan(0);
    expect(t.limitations.join(" ")).toContain("does not prove protection");
  });

  it("serializes an embedding report with a transfer block", async () => {
    const a = createSyntheticImage(96, 96, 3, 1);
    const b = createSyntheticImage(96, 96, 3, 999);
    const report = await runEmbeddingAudit(backend, a, b);

    // Simulate a comparison model using deterministic mock embeddings.
    const originalEmbedding = backend.embedImage(a) as number[];
    const candidateEmbedding = backend.embedImage(b) as number[];
    report.transfer = buildTransferReport("mock-primary", report.embedding.drift, [
      buildTransferComparison(
        "mock-compare",
        originalEmbedding,
        candidateEmbedding,
        report.embedding.drift,
      ),
    ]);

    const json = JSON.parse(serializeEmbeddingReport(report));
    expect(json.version).toBe("0.2.0");
    expect(json.transfer.primaryModel).toBe("mock-primary");
    expect(json.transfer.comparisons).toHaveLength(1);
    expect(json.transfer.comparisons[0].model).toBe("mock-compare");
    // Same backend on both sides => identical drift => ratio 1.
    expect(json.transfer.comparisons[0].transferRatio).toBeCloseTo(1, 10);
    expect(json.transfer.summary.primaryDrift).toBeCloseTo(
      json.transfer.summary.averageTransferDrift,
      10,
    );
    expect(Array.isArray(json.transfer.limitations)).toBe(true);
  });

  it("renders a transfer section in the HTML report only when present", async () => {
    const a = createSyntheticImage(96, 96, 3, 1);
    const b = createSyntheticImage(96, 96, 3, 999);
    const report = await runEmbeddingAudit(backend, a, b);

    const withoutTransfer = renderEmbeddingHtmlReport(report);
    expect(withoutTransfer).not.toContain("Transfer across models");

    report.transfer = buildTransferReport("mock-primary", report.embedding.drift, [
      buildTransferComparison(
        "mock-compare",
        backend.embedImage(a) as number[],
        backend.embedImage(b) as number[],
        report.embedding.drift,
      ),
    ]);
    const withTransfer = renderEmbeddingHtmlReport(report);
    expect(withTransfer).toContain("Transfer across models");
    expect(withTransfer).toContain("mock-compare");
    expect(withTransfer).toContain("Transfer ratio");
  });

  it("renders a dash for a null transfer ratio in HTML", async () => {
    const img = createSyntheticImage(96, 96, 3, 5);
    // Identical images => primary drift 0 => null ratio.
    const report = await runEmbeddingAudit(backend, img, img);
    report.transfer = buildTransferReport("mock-primary", report.embedding.drift, [
      buildTransferComparison(
        "mock-compare",
        backend.embedImage(img) as number[],
        backend.embedImage(img) as number[],
        report.embedding.drift,
      ),
    ]);
    expect(report.transfer.comparisons[0].transferRatio).toBeNull();
    expect(renderEmbeddingHtmlReport(report)).toContain("&mdash;");
  });
});
