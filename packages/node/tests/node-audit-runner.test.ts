import { describe, expect, it } from "vitest";
import type { AuditConfig } from "@openartshield/core";
import { embedAndAudit, defaultTransforms } from "../src/index.js";
import { createSyntheticImage } from "./helpers.js";

describe("node audit runner", () => {
  const config: AuditConfig = {
    message: "artist=demo;license=no-ai-training",
    seed: 123,
    strength: 16,
    repetitions: 5,
    imagePath: "protected.png",
  };

  it("embeds and audits an image against the full default suite", async () => {
    const image = createSyntheticImage(384, 384, 3);
    const { protectedImage, report } = await embedAndAudit(image, config);

    expect(protectedImage.width).toBe(384);
    expect(report.version).toBe("0.1.0");
    // identity + every default transform.
    expect(report.results).toHaveLength(defaultTransforms.length + 1);

    const identity = report.results.find((r) => r.transform === "identity");
    expect(identity?.messageRecovered).toBe(true);
    expect(identity?.bitAccuracy).toBe(1);
  });

  it("produces a well-formed summary", async () => {
    const image = createSyntheticImage(384, 384, 3);
    const { report } = await embedAndAudit(image, config);

    expect(report.summary.totalTransforms).toBe(report.results.length);
    expect(report.summary.successfulRecoveries).toBeGreaterThanOrEqual(1);
    expect(report.summary.averageBitAccuracy).toBeGreaterThan(0);
    expect(report.summary.averageBitAccuracy).toBeLessThanOrEqual(1);
  });
});
