import { describe, expect, it } from "vitest";
import { createMockEmbeddingBackend } from "../src/ai/mock-backend.js";
import { runAttackAudit, survivalRatio } from "../src/attack/runner.js";
import { serializeAttackReport, renderAttackHtmlReport } from "../src/attack/report.js";
import { clampByte } from "../src/utils/math.js";
import type { ImageTransform } from "../src/audit/types.js";
import type { PixelImage } from "../src/types.js";
import { createSyntheticImage } from "./helpers.js";

const backend = createMockEmbeddingBackend();

// A cloaked image = original with a spatially non-uniform brightness change
// (left half brightened). The mock backend mean-centers its downsampled-luma
// feature, so a *uniform* shift would cancel out; a one-sided change moves it.
function cloakOf(original: PixelImage): PixelImage {
  const { width, height, channels } = original;
  const data = new Uint8ClampedArray(original.data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= width / 2) continue; // only the left half
      const base = (y * width + x) * channels;
      for (let c = 0; c < 3; c++) data[base + c] = clampByte(data[base + c] + 30);
    }
  }
  return { ...original, data };
}

const identity: ImageTransform = {
  name: "identity_attack",
  apply: (image) => ({ ...image, data: new Uint8ClampedArray(image.data) }),
};

describe("survivalRatio", () => {
  it("is driftAfter / driftBefore, and null when driftBefore is zero", () => {
    expect(survivalRatio(0.1, 0.05)).toBeCloseTo(0.5, 10);
    expect(survivalRatio(0.1, 0.1)).toBeCloseTo(1, 10);
    expect(survivalRatio(0.1, 0)).toBe(0);
    expect(survivalRatio(0, 0.05)).toBeNull();
    expect(survivalRatio(0, 0)).toBeNull();
  });
});

describe("runAttackAudit", () => {
  it("reports survival 1 for an identity attack and full removal when the attack reverts to the original", async () => {
    const original = createSyntheticImage(96, 96, 3, 3);
    const cloaked = cloakOf(original);

    // An attack that returns the original = perfect purification => zero drift left.
    const revert: ImageTransform = {
      name: "revert_attack",
      apply: () => ({ ...original, data: new Uint8ClampedArray(original.data) }),
    };

    const report = await runAttackAudit(backend, original, cloaked, {
      attacks: [identity, revert],
    });

    expect(report.driftBefore).toBeGreaterThan(0);
    const byName = Object.fromEntries(report.results.map((r) => [r.attack, r]));
    // Identity leaves the cloak intact.
    expect(byName.identity_attack.survivalRatio).toBeCloseTo(1, 6);
    // Reverting removes it entirely.
    expect(byName.revert_attack.driftAfter).toBeCloseTo(0, 6);
    expect(byName.revert_attack.survivalRatio).toBeCloseTo(0, 6);
  });

  it("summarizes mean and worst-case survival across attacks", async () => {
    const original = createSyntheticImage(80, 80, 3, 6);
    const cloaked = cloakOf(original);
    const revert: ImageTransform = {
      name: "revert_attack",
      apply: () => ({ ...original, data: new Uint8ClampedArray(original.data) }),
    };

    const report = await runAttackAudit(backend, original, cloaked, {
      attacks: [identity, revert],
    });
    expect(report.summary.attacksTested).toBe(2);
    // mean of ~1 and ~0
    expect(report.summary.meanSurvivalRatio).toBeCloseTo(0.5, 4);
    expect(report.summary.minSurvivalRatio).toBeCloseTo(0, 6);
  });

  it("handles a zero-drift cloak with null survival ratios", async () => {
    const original = createSyntheticImage(64, 64, 3, 5);
    // cloaked == original => driftBefore 0 => survival undefined.
    const report = await runAttackAudit(backend, original, original, { attacks: [identity] });
    expect(report.driftBefore).toBeCloseTo(0, 6);
    expect(report.results[0].survivalRatio).toBeNull();
    expect(report.summary.meanSurvivalRatio).toBeNull();
    expect(report.summary.minSurvivalRatio).toBeNull();
  });

  it("records PSNR/SSIM of the attacked vs. cloaked image", async () => {
    const original = createSyntheticImage(64, 64, 3, 7);
    const cloaked = cloakOf(original);
    const report = await runAttackAudit(backend, original, cloaked, { attacks: [identity] });
    // identity does not change pixels => infinite PSNR clamps to null, SSIM 1.
    expect(report.results[0].psnr).toBeNull();
    expect(report.results[0].ssim).toBeCloseTo(1, 6);
  });
});

describe("attack report", () => {
  it("serializes JSON and renders self-contained HTML with limitations", async () => {
    const original = createSyntheticImage(64, 64, 3, 7);
    const cloaked = cloakOf(original);
    const report = await runAttackAudit(backend, original, cloaked, { attacks: [identity] });

    const json = JSON.parse(serializeAttackReport(report));
    expect(json.version).toBe("0.1.0");
    expect(json.backend).toBe("mock");
    expect(Array.isArray(json.limitations)).toBe(true);
    expect(json.limitations.length).toBeGreaterThan(0);

    const html = renderAttackHtmlReport(report);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("attack audit");
    expect(html).toContain("Survival ratio");
    expect(html).toContain("identity_attack");
  });
});
