import { describe, expect, it } from "vitest";
import { boundedNoiseCandidate } from "../src/cloak/perturb.js";
import { runCloak } from "../src/cloak/runner.js";
import { serializeCloakReport, renderCloakHtmlReport } from "../src/cloak/report.js";
import { EOT_TRANSFORM_NAMES, eotTransformNames, resolveEotMode } from "../src/cloak/eot.js";
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
    expect(json.version).toBe("0.2.0");
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
