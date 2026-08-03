import { describe, expect, it } from "vitest";
import { createBchCodec } from "../src/trustmark/bch.js";
import {
  bitsFromLogits,
  bitsToText,
  decodePayload,
  encodePayload,
  floatsFromBits,
  textToBits,
  TRUSTMARK_VERSIONS,
  versionDataBits,
} from "../src/trustmark/datalayer.js";

// Reference vectors from the Adobe TrustMark Rust port (rust/src/bits/bch.rs
// and rust/src/bits.rs tests), which are themselves checked against the
// canonical Python implementation.

const BCH5_DATA = "1011011110011000111111000000011111011111011100000110110110111";
const BCH5_PAYLOAD =
  "1011011110011000111111000000011111011111011100000110110110111000110010101101111010011011000010000001";

describe("BCH codec (reference vectors)", () => {
  it("encodes all-zero data to all-zero ecc (t=8)", () => {
    const codec = createBchCodec(8);
    expect(Array.from(codec.encode(new Uint8Array(8)))).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("matches the t=4 reference vector", () => {
    const codec = createBchCodec(4);
    const ecc = codec.encode(new Uint8Array([133, 20, 228, 249, 11, 172, 165, 151, 0]));
    expect(Array.from(ecc)).toEqual([115, 32, 10, 0]);
  });

  it("corrects injected bit flips up to t", () => {
    const codec = createBchCodec(5);
    const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const ecc = codec.encode(original.slice());

    const corrupted = original.slice();
    corrupted[0] ^= 0b1000_0001; // 2 flips
    corrupted[5] ^= 0b0001_0000; // 1 flip
    const flips = codec.decode(corrupted, ecc);
    expect(flips).toBe(3);
    expect(Array.from(corrupted)).toEqual(Array.from(original));
  });
});

describe("TrustMark payload schema", () => {
  it("matches the BCH_5 reference payload", () => {
    expect(encodePayload(BCH5_DATA, "BCH_5")).toBe(BCH5_PAYLOAD);
  });

  it("round-trips a clean payload", () => {
    const decoded = decodePayload(BCH5_PAYLOAD);
    expect(decoded).not.toBeNull();
    expect(decoded?.data).toBe(BCH5_DATA);
    expect(decoded?.version).toBe("BCH_5");
    expect(decoded?.correctedBitFlips).toBe(0);
  });

  it("corrects a single bit flip (reference vector)", () => {
    const flipped = `0${BCH5_PAYLOAD.slice(1)}`;
    const decoded = decodePayload(flipped);
    expect(decoded?.data).toBe(BCH5_DATA);
    expect(decoded?.correctedBitFlips).toBe(1);
  });

  it("recovers from a corrupted version marker (reference vector)", () => {
    const corrupted = `0${BCH5_PAYLOAD.slice(1, 99)}1`;
    const decoded = decodePayload(corrupted);
    expect(decoded?.data).toBe(BCH5_DATA);
  });

  it("returns null for a fully corrupted payload (reference vector)", () => {
    const corrupted =
      "0000000000000000000000000000000000000000000100000110110110111000110010101101111010011011000010000001";
    expect(decodePayload(corrupted)).toBeNull();
    expect(decodePayload("1".repeat(100))).toBeNull();
  });

  it("round-trips every version at full capacity with flips within budget", () => {
    for (const version of TRUSTMARK_VERSIONS) {
      const bits = versionDataBits(version);
      let data = "";
      let state = 0x9e3779b9 ^ bits;
      for (let i = 0; i < bits; i++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        data += state & 0x8000 ? "1" : "0";
      }
      const payload = encodePayload(data, version);
      expect(payload).toHaveLength(100);

      // Flip 3 bits (within every version's correction budget).
      const chars = payload.split("");
      for (const position of [2, 47, 90]) {
        chars[position] = chars[position] === "0" ? "1" : "0";
      }
      const decoded = decodePayload(chars.join(""));
      expect(decoded?.data, version).toBe(data);
      expect(decoded?.version, version).toBe(version);
    }
  });

  it("rejects oversized payloads and bad characters", () => {
    expect(() => encodePayload("0".repeat(62), "BCH_5")).toThrow(/at most 61/);
    expect(() => encodePayload("012", "BCH_5")).toThrow(/'0' and '1'/);
    expect(() => decodePayload("01")).toThrow(/100 bits/);
  });
});

describe("logits and floats", () => {
  it("thresholds logits at zero", () => {
    const logits = new Array(100).fill(-1.5);
    logits[0] = 0.2;
    logits[99] = 0;
    const bits = bitsFromLogits(logits);
    expect(bits[0]).toBe("1");
    expect(bits[1]).toBe("0");
    expect(bits[99]).toBe("1");
  });

  it("maps bits to 0/1 floats", () => {
    expect(Array.from(floatsFromBits("101"))).toEqual([1, 0, 1]);
  });
});

describe("text mode (7-bit ascii)", () => {
  it("round-trips through payload encode/decode", () => {
    const bits = textToBits("oas-demo", "BCH_5");
    const payload = encodePayload(bits, "BCH_5");
    const decoded = decodePayload(payload);
    expect(decoded).not.toBeNull();
    expect(bitsToText(decoded!.data)).toBe("oas-demo");
  });

  it("enforces capacity and ascii range", () => {
    expect(() => textToBits("123456789", "BCH_5")).toThrow(/fits 8/);
    expect(() => textToBits("ñ", "BCH_5")).toThrow(/7-bit/);
  });
});
