import { describe, expect, it } from "vitest";
import {
  ATTACK_SET_NAMES,
  defaultAttacks,
  isAttackSetName,
  noisyUpscale,
  resolveAttackSet,
} from "../src/index.js";
import { createSyntheticImage } from "./helpers.js";

describe("removal attacks", () => {
  it("exposes a named default suite covering the published attack families", () => {
    const names = defaultAttacks.map((a) => a.name);
    expect(names).toContain("noisy_upscale");
    expect(names).toContain("jpeg_quality_50");
    expect(names).toContain("jpeg_quality_30");
    expect(names).toContain("gaussian_purify");
  });

  it("resolves attack sets and fails clearly on an unknown one", () => {
    expect(ATTACK_SET_NAMES).toEqual(["none", "standard"]);
    expect(isAttackSetName("standard")).toBe(true);
    expect(resolveAttackSet("none")).toEqual([]);
    expect(resolveAttackSet("standard").length).toBe(defaultAttacks.length);
    expect(() => resolveAttackSet("aggressive")).toThrow(/Unknown attack set "aggressive"/);
    expect(() => resolveAttackSet("aggressive")).toThrow(/none, standard/);
  });

  it("noisy_upscale preserves dimensions, changes pixels, and is deterministic", async () => {
    const img = createSyntheticImage(64, 64, 3);
    const attack = noisyUpscale(3, 2, 42, "noisy_upscale_test");
    const a = await attack.apply(img);
    const b = await attack.apply(img);

    expect(a.width).toBe(64);
    expect(a.height).toBe(64);
    // Same seed/params => byte-identical output.
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    // The attack actually changed the image.
    let diff = 0;
    for (let i = 0; i < a.data.length; i++) if (a.data[i] !== img.data[i]) diff++;
    expect(diff).toBeGreaterThan(0);
  });

  it("every default attack preserves image dimensions", async () => {
    const img = createSyntheticImage(48, 48, 3);
    for (const attack of defaultAttacks) {
      const out = await attack.apply(img);
      expect(out.width).toBe(48);
      expect(out.height).toBe(48);
    }
  });
});
