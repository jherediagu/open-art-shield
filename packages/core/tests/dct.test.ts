import { describe, expect, it } from "vitest";
import { forwardDct, inverseDct } from "../src/watermark/dct.js";
import { DctError } from "../src/errors.js";
import { Prng } from "../src/utils/prng.js";

function randomBlock(seed: number): number[] {
  const prng = new Prng(seed);
  return Array.from({ length: 64 }, () => Math.round(prng.next() * 255));
}

describe("DCT", () => {
  it("reconstructs a block through forward + inverse DCT", () => {
    const block = randomBlock(7);
    const restored = inverseDct(forwardDct(block));
    for (let i = 0; i < block.length; i++) {
      expect(restored[i]).toBeCloseTo(block[i], 6);
    }
  });

  it("is stable: repeated transforms give identical output", () => {
    const block = randomBlock(11);
    const a = forwardDct(block);
    const b = forwardDct(block);
    expect(a).toEqual(b);
  });

  it("places most energy in the DC coefficient for a flat block", () => {
    const flat = new Array<number>(64).fill(100);
    const coeffs = forwardDct(flat);
    // DC term holds the energy; all AC terms should be ~0.
    expect(Math.abs(coeffs[0])).toBeGreaterThan(100);
    for (let i = 1; i < 64; i++) {
      expect(Math.abs(coeffs[i])).toBeLessThan(1e-6);
    }
  });

  it("rejects blocks of invalid size", () => {
    expect(() => forwardDct([1, 2, 3])).toThrow(DctError);
    expect(() => inverseDct(new Array<number>(63).fill(0))).toThrow(DctError);
  });
});
