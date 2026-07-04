import { describe, expect, it } from "vitest";
import { boundedNoiseCandidate } from "../src/cloak/perturb.js";
import { runCloak } from "../src/cloak/runner.js";
import { serializeCloakReport, renderCloakHtmlReport } from "../src/cloak/report.js";
import { EOT_TRANSFORM_NAMES, eotTransformNames, resolveEotMode } from "../src/cloak/eot.js";
import {
  aggregateAverageDrift,
  aggregateMinModelDrift,
  type CloakModelScore,
} from "../src/cloak/scoring.js";
import { createMockEmbeddingBackend } from "../src/ai/mock-backend.js";
import { clampByte } from "../src/utils/math.js";
import type { ImageTransform } from "../src/audit/types.js";
import { createSyntheticImage, countDifferences } from "./helpers.js";

const backend = createMockEmbeddingBackend();

const identity: ImageTransform = {
  name: "identity_test",
  apply: (image) => ({ ...image, data: new Uint8ClampedArray(image.data) }),
};
const brighten: ImageTransform = {
  name: "brighten_test",
  apply: (image) => {
    const data = new Uint8ClampedArray(image.data);
    for (let i = 0; i < data.length; i++) {
      if (image.channels === 4 && i % 4 === 3) continue;
      data[i] = clampByte(data[i] + 5);
    }
    return { ...image, data };
  },
};

describe("boundedNoiseCandidate", () => {
  it("is deterministic for the same (seed, step) and varies across steps", () => {
    const img = createSyntheticImage(48, 48, 3, 2);
    const a = boundedNoiseCandidate(img, 123, 5, 0);
    const b = boundedNoiseCandidate(img, 123, 5, 0);
    const c = boundedNoiseCandidate(img, 123, 5, 1);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(countDifferences(a, c)).toBeGreaterThan(0);
  });

  it("never changes a channel by more than strength and preserves dims/alpha", () => {
    const img = createSyntheticImage(40, 40, 4, 9);
    const strength = 4;
    const out = boundedNoiseCandidate(img, 7, strength, 3);
    expect(out.width).toBe(40);
    expect(out.height).toBe(40);
    expect(out.channels).toBe(4);
    for (let p = 0; p < img.width * img.height; p++) {
      const base = p * 4;
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(out.data[base + c] - img.data[base + c])).toBeLessThanOrEqual(strength);
      }
      expect(out.data[base + 3]).toBe(img.data[base + 3]); // alpha untouched
    }
  });
});

describe("runCloak", () => {
  it("improves drift and returns a changed image (loose quality)", async () => {
    const img = createSyntheticImage(96, 96, 3, 3);
    const { image, report } = await runCloak(backend, img, {
      strength: 8,
      steps: 8,
      minPsnr: 20,
      maxSsimDrop: 0.5,
    });
    expect(report.result.improved).toBe(true);
    expect(report.result.bestDrift).toBeGreaterThan(0);
    expect(report.result.initialDrift).toBe(0);
    expect(countDifferences(img, image)).toBeGreaterThan(0);
  });

  it("does not improve and returns the original when strength is 0", async () => {
    const img = createSyntheticImage(96, 96, 3, 4);
    const { image, report } = await runCloak(backend, img, { strength: 0, steps: 5 });
    expect(report.result.improved).toBe(false);
    expect(report.result.bestDrift).toBe(0);
    expect(countDifferences(img, image)).toBe(0); // unchanged original
  });

  it("rejects candidates that break the quality guardrails", async () => {
    const img = createSyntheticImage(96, 96, 3, 5);
    const { report } = await runCloak(backend, img, {
      strength: 80,
      steps: 6,
      minPsnr: 55, // unreachable with strength 80
    });
    expect(report.result.improved).toBe(false);
    expect(report.result.candidatesRejected).toBe(6);
  });

  it("measures robustness across the provided transforms", async () => {
    const img = createSyntheticImage(96, 96, 3, 6);
    const { report } = await runCloak(backend, img, {
      strength: 8,
      steps: 4,
      minPsnr: 20,
      maxSsimDrop: 0.5,
      transforms: [identity, brighten],
    });
    expect(report.robustness.transformsTested).toBe(2);
  });
});

describe("cloak report", () => {
  it("serializes JSON and renders self-contained HTML with limitations", async () => {
    const img = createSyntheticImage(64, 64, 3, 7);
    const { report } = await runCloak(backend, img, {
      strength: 8,
      steps: 4,
      minPsnr: 20,
      maxSsimDrop: 0.5,
    });
    const json = JSON.parse(serializeCloakReport(report));
    expect(json.version).toBe("0.3.0");
    expect(Array.isArray(json.limitations)).toBe(true);
    expect(json.limitations.length).toBeGreaterThan(0);

    const html = renderCloakHtmlReport(report);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("does not prevent AI training");
    expect(html).toContain(report.backend.id);
  });

  it("includes the EOT summary in JSON and HTML", async () => {
    const img = createSyntheticImage(64, 64, 3, 7);
    const { report } = await runCloak(backend, img, {
      strength: 8,
      steps: 4,
      minPsnr: 20,
      maxSsimDrop: 0.5,
      eotMode: "mild",
      eotTransforms: [identity, brighten],
    });

    const json = JSON.parse(serializeCloakReport(report));
    expect(json.eot.mode).toBe("mild");
    expect(json.eot.transforms).toEqual(["clean", "identity_test", "brighten_test"]);
    expect(typeof json.eot.cleanDrift).toBe("number");
    expect(typeof json.eot.averageDrift).toBe("number");
    expect(typeof json.eot.minDrift).toBe("number");
    expect(json.eot.embeddingEvaluations).toBeGreaterThan(0);

    const html = renderCloakHtmlReport(report);
    expect(html).toContain("EOT mode");
    expect(html).toContain("mild");
  });
});

describe("EOT modes", () => {
  it("maps each mode to its expected transform set (clean always first)", () => {
    expect(eotTransformNames("none")).toEqual(["clean"]);
    expect(eotTransformNames("mild")).toEqual([
      "clean",
      "jpeg_quality_95",
      "jpeg_quality_85",
      "brightness_0_9",
      "brightness_1_1",
      "gaussian_blur_0_75",
    ]);
    expect(eotTransformNames("standard")).toEqual([
      "clean",
      "jpeg_quality_95",
      "jpeg_quality_85",
      "jpeg_quality_70",
      "resize_75",
      "brightness_0_9",
      "brightness_1_1",
      "contrast_0_9",
      "contrast_1_1",
      "gaussian_blur_0_75",
      "screenshot_simulation",
    ]);
    // The runner scores "clean" implicitly, so the name map excludes it.
    expect(EOT_TRANSFORM_NAMES.none).toEqual([]);
  });

  it("resolves valid modes and fails clearly on an unknown one", () => {
    expect(resolveEotMode("none")).toBe("none");
    expect(resolveEotMode("standard")).toBe("standard");
    expect(() => resolveEotMode("wild")).toThrow(/Unknown EOT mode "wild"/);
    expect(() => resolveEotMode("wild")).toThrow(/none, mild, standard/);
  });
});

describe("runCloak EOT scoring", () => {
  it("eot none preserves clean-only behavior", async () => {
    const img = createSyntheticImage(96, 96, 3, 3);
    const { report } = await runCloak(backend, img, {
      strength: 8,
      steps: 8,
      minPsnr: 20,
      maxSsimDrop: 0.5,
    });
    expect(report.eot.mode).toBe("none");
    expect(report.eot.transforms).toEqual(["clean"]);
    // With no EOT transforms the score is the clean drift of the chosen image.
    expect(report.eot.cleanDrift).toBe(report.result.bestDrift);
    expect(report.eot.averageDrift).toBe(report.result.bestDrift);
    expect(report.eot.minDrift).toBe(report.result.bestDrift);
  });

  it("averages drift across the injected EOT variants", async () => {
    const img = createSyntheticImage(96, 96, 3, 6);
    const { report } = await runCloak(backend, img, {
      strength: 8,
      steps: 6,
      minPsnr: 20,
      maxSsimDrop: 0.5,
      eotMode: "mild",
      eotTransforms: [identity, brighten],
    });
    expect(report.result.improved).toBe(true);
    expect(report.eot.transforms).toEqual(["clean", "identity_test", "brighten_test"]);
    // Average lies between the min and the (clean) max of the variants.
    expect(report.eot.minDrift).toBeLessThanOrEqual(report.eot.averageDrift);
    // One original embed + (1 clean + 2 EOT) per scored candidate, plus none for
    // robustness here. With identity scoring 'clean' twice the count is positive.
    expect(report.eot.embeddingEvaluations).toBeGreaterThan(0);
  });

  it("is deterministic for identical inputs (mock backend)", async () => {
    const img = createSyntheticImage(80, 80, 3, 11);
    const config = {
      strength: 8,
      steps: 5,
      minPsnr: 20,
      maxSsimDrop: 0.5,
      eotMode: "mild" as const,
      eotTransforms: [identity, brighten],
    };
    const a = await runCloak(backend, img, config);
    const b = await runCloak(backend, img, config);
    expect(serializeCloakReport(a.report)).toBe(serializeCloakReport(b.report));
    expect(Array.from(a.image.data)).toEqual(Array.from(b.image.data));
  });
});

describe("mock backend variants", () => {
  it("keys deterministic distinct variants by id", () => {
    const base = createMockEmbeddingBackend();
    const a1 = createMockEmbeddingBackend("model-a");
    const a2 = createMockEmbeddingBackend("model-a");
    const b = createMockEmbeddingBackend("model-b");
    expect(base.id).toBe("mock");
    expect(a1.id).toBe("mock:model-a");
    expect(b.id).toBe("mock:model-b");

    const img = createSyntheticImage(64, 64, 3, 3);
    const ea1 = a1.embedImage(img) as number[];
    const ea2 = a2.embedImage(img) as number[];
    const eb = b.embedImage(img) as number[];
    const ebase = base.embedImage(img) as number[];
    expect(ea1).toEqual(ea2); // same variant => same embedding
    expect(ea1).not.toEqual(eb); // different variants disagree
    expect(ea1).not.toEqual(ebase); // and differ from the base mock
  });
});

describe("multi-model scoring aggregates", () => {
  const score = (model: string, avg: number): CloakModelScore => ({
    model,
    cleanDrift: avg,
    averageEotDrift: avg,
    minEotDrift: avg,
  });

  it("averages per-model average EOT drifts", () => {
    expect(aggregateAverageDrift([score("a", 0.2), score("b", 0.4)])).toBeCloseTo(0.3, 10);
    expect(aggregateAverageDrift([])).toBe(0);
  });

  it("reports the weakest model's drift", () => {
    expect(aggregateMinModelDrift([score("a", 0.2), score("b", 0.4)])).toBeCloseTo(0.2, 10);
    expect(aggregateMinModelDrift([])).toBe(0);
  });
});

describe("runCloak multi-model scoring", () => {
  const scoreA = createMockEmbeddingBackend("model-a");
  const scoreB = createMockEmbeddingBackend("model-b");

  it("scores candidates across all models and reports per-model stats", async () => {
    const img = createSyntheticImage(96, 96, 3, 6);
    const { report } = await runCloak(backend, img, {
      strength: 8,
      steps: 6,
      minPsnr: 20,
      maxSsimDrop: 0.5,
      eotMode: "mild",
      eotTransforms: [identity, brighten],
      scoreBackends: [scoreA, scoreB],
    });

    expect(report.result.improved).toBe(true);
    expect(report.scoring.mode).toBe("multi-model");
    expect(report.scoring.primaryModel).toBe("mock");
    expect(report.scoring.scoreModels).toEqual(["mock:model-a", "mock:model-b"]);
    expect(report.scoring.models).toHaveLength(3);
    expect(report.scoring.models[0].model).toBe("mock"); // primary first

    // Aggregate is the mean of the per-model average EOT drifts; the weakest
    // model is their minimum.
    const avgs = report.scoring.models.map((m) => m.averageEotDrift);
    const expectedAggregate = avgs.reduce((a, b) => a + b, 0) / avgs.length;
    expect(report.scoring.aggregateAverageDrift).toBeCloseTo(expectedAggregate, 10);
    expect(report.scoring.aggregateMinModelDrift).toBeCloseTo(Math.min(...avgs), 10);

    // The eot block mirrors the primary model's stats.
    expect(report.eot.cleanDrift).toBe(report.scoring.models[0].cleanDrift);
    expect(report.eot.averageDrift).toBe(report.scoring.models[0].averageEotDrift);
  });

  it("is deterministic for identical inputs", async () => {
    const img = createSyntheticImage(80, 80, 3, 11);
    const config = {
      strength: 8,
      steps: 5,
      minPsnr: 20,
      maxSsimDrop: 0.5,
      scoreBackends: [scoreA, scoreB],
    };
    const a = await runCloak(backend, img, config);
    const b = await runCloak(backend, img, config);
    expect(serializeCloakReport(a.report)).toBe(serializeCloakReport(b.report));
    expect(Array.from(a.image.data)).toEqual(Array.from(b.image.data));
  });

  it("returns the original and reports no improvement when nothing beats the aggregate", async () => {
    const img = createSyntheticImage(96, 96, 3, 4);
    const { image, report } = await runCloak(backend, img, {
      strength: 0, // identical candidates => zero drift on every model
      steps: 4,
      scoreBackends: [scoreA, scoreB],
    });
    expect(report.result.improved).toBe(false);
    expect(report.scoring.aggregateAverageDrift).toBe(0);
    expect(countDifferences(img, image)).toBe(0);
  });

  it("falls back to single-model scoring with no score backends", async () => {
    const img = createSyntheticImage(96, 96, 3, 3);
    const { report } = await runCloak(backend, img, {
      strength: 8,
      steps: 4,
      minPsnr: 20,
      maxSsimDrop: 0.5,
    });
    expect(report.scoring.mode).toBe("single-model");
    expect(report.scoring.scoreModels).toEqual([]);
    expect(report.scoring.models).toHaveLength(1);
    // With one model the aggregate is that model's average EOT drift.
    expect(report.scoring.aggregateAverageDrift).toBe(report.eot.averageDrift);
    expect(report.scoring.aggregateMinModelDrift).toBe(report.eot.averageDrift);
  });

  it("serializes and renders the multi-model scoring section", async () => {
    const img = createSyntheticImage(64, 64, 3, 7);
    const { report } = await runCloak(backend, img, {
      strength: 8,
      steps: 4,
      minPsnr: 20,
      maxSsimDrop: 0.5,
      scoreBackends: [scoreA],
    });

    const json = JSON.parse(serializeCloakReport(report));
    expect(json.scoring.mode).toBe("multi-model");
    expect(json.scoring.models).toHaveLength(2);
    expect(typeof json.scoring.aggregateAverageDrift).toBe("number");
    expect(typeof json.scoring.aggregateMinModelDrift).toBe("number");

    const html = renderCloakHtmlReport(report);
    expect(html).toContain("Model scoring (multi-model)");
    expect(html).toContain("mock:model-a");
    expect(html).toContain("Weakest model drift");
    expect(html).toContain("Aggregate average drift");
  });
});
