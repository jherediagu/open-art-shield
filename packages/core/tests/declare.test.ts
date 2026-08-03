import { describe, expect, it } from "vitest";
import {
  buildDeclareManifest,
  buildTrainingMiningAssertion,
  isDeclareFormat,
  isTrainingUse,
  TRAINING_MINING_ASSERTION_LABEL,
  TRAINING_MINING_ENTRY_KEYS,
} from "../src/declare.js";

describe("buildTrainingMiningAssertion", () => {
  it("denies everything by default", () => {
    const assertion = buildTrainingMiningAssertion();
    expect(assertion.label).toBe(TRAINING_MINING_ASSERTION_LABEL);
    for (const key of TRAINING_MINING_ENTRY_KEYS) {
      expect(assertion.data.entries[key]).toEqual({ use: "notAllowed" });
    }
  });

  it("applies per-category preferences", () => {
    const assertion = buildTrainingMiningAssertion({
      aiInference: { use: "allowed" },
      dataMining: { use: "constrained", constraintInfo: "Search indexing only." },
    });
    expect(assertion.data.entries["cawg.ai_inference"]).toEqual({ use: "allowed" });
    expect(assertion.data.entries["cawg.data_mining"]).toEqual({
      use: "constrained",
      constraint_info: "Search indexing only.",
    });
    // Untouched categories stay denied.
    expect(assertion.data.entries["cawg.ai_training"]).toEqual({ use: "notAllowed" });
    expect(assertion.data.entries["cawg.ai_generative_training"]).toEqual({ use: "notAllowed" });
  });

  it("rejects constraintInfo on non-constrained uses", () => {
    expect(() =>
      buildTrainingMiningAssertion({ aiTraining: { use: "allowed", constraintInfo: "nope" } }),
    ).toThrow(/constrained/);
  });

  it("rejects invalid uses", () => {
    expect(() =>
      buildTrainingMiningAssertion({
        aiTraining: { use: "maybe" as never },
      }),
    ).toThrow(/Invalid training use/);
  });

  it("is deterministic", () => {
    expect(buildTrainingMiningAssertion({ aiInference: { use: "allowed" } })).toEqual(
      buildTrainingMiningAssertion({ aiInference: { use: "allowed" } }),
    );
  });
});

describe("buildDeclareManifest", () => {
  const base = {
    title: "artwork.png",
    format: "image/png" as const,
    claimGenerator: "openartshield/0.1.0",
  };

  it("builds a manifest with the training-mining assertion", () => {
    const manifest = buildDeclareManifest(base);
    expect(manifest.claim_generator).toBe("openartshield/0.1.0");
    expect(manifest.format).toBe("image/png");
    expect(manifest.title).toBe("artwork.png");
    expect(manifest.assertions).toHaveLength(1);
    expect(manifest.assertions[0].label).toBe(TRAINING_MINING_ASSERTION_LABEL);
  });

  it("adds a CreativeWork author assertion when a creator is given", () => {
    const manifest = buildDeclareManifest({ ...base, creatorName: "Demo Artist" });
    expect(manifest.assertions).toHaveLength(2);
    const creative = manifest.assertions[1];
    expect(creative.label).toBe("stds.schema-org.CreativeWork");
    expect(creative.data).toMatchObject({
      author: [{ "@type": "Person", name: "Demo Artist" }],
    });
  });

  it("passes training preferences through", () => {
    const manifest = buildDeclareManifest({
      ...base,
      training: { aiInference: { use: "allowed" } },
    });
    const assertion = manifest.assertions[0] as ReturnType<typeof buildTrainingMiningAssertion>;
    expect(assertion.data.entries["cawg.ai_inference"].use).toBe("allowed");
  });

  it("rejects empty titles, empty generators, and unknown formats", () => {
    expect(() => buildDeclareManifest({ ...base, title: "" })).toThrow(/title/);
    expect(() => buildDeclareManifest({ ...base, claimGenerator: "" })).toThrow(/claimGenerator/);
    expect(() => buildDeclareManifest({ ...base, format: "image/gif" as never })).toThrow(
      /Unsupported declare format/,
    );
  });
});

describe("guards", () => {
  it("isTrainingUse", () => {
    expect(isTrainingUse("allowed")).toBe(true);
    expect(isTrainingUse("notAllowed")).toBe(true);
    expect(isTrainingUse("constrained")).toBe(true);
    expect(isTrainingUse("deny")).toBe(false);
    expect(isTrainingUse(1)).toBe(false);
  });

  it("isDeclareFormat", () => {
    expect(isDeclareFormat("image/png")).toBe(true);
    expect(isDeclareFormat("image/jpeg")).toBe(true);
    expect(isDeclareFormat("image/webp")).toBe(true);
    expect(isDeclareFormat("image/gif")).toBe(false);
  });
});
