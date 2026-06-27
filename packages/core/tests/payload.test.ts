import { describe, expect, it } from "vitest";
import {
  decodePayload,
  encodePayload,
  majorityVoteGroups,
  payloadByteLength,
  repeatBits,
} from "../src/watermark/payload.js";
import { bitsToBytes, bytesToBits } from "../src/utils/bits.js";
import { crc32 } from "../src/utils/crc32.js";
import { messageByteLength } from "../src/watermark/payload.js";

describe("payload encoding", () => {
  it("round-trips a message through bits and back", () => {
    const message = "artist=demo;license=no-ai-training";
    const repetitions = 5;
    const { bits, messageByteLength: len } = encodePayload(message, repetitions);

    // De-repeat (no corruption) and decode.
    const decoded = decodePayload(bits, len, repetitions);
    expect(decoded.checksumValid).toBe(true);
    expect(decoded.recoveredMessage).toBe(message);
  });

  it("reports the correct UTF-8 message byte length", () => {
    const { messageByteLength: len } = encodePayload("hello", 1);
    expect(len).toBe(5);
  });

  it("detects corrupted payloads via checksum", () => {
    const message = "secret-message";
    const repetitions = 1;
    const { bits, messageByteLength: len } = encodePayload(message, repetitions);

    // Flip several message bits so the checksum no longer matches.
    const corrupted = bits.slice();
    corrupted[0] ^= 1;
    corrupted[5] ^= 1;
    corrupted[9] ^= 1;

    const decoded = decodePayload(corrupted, len, repetitions);
    expect(decoded.checksumValid).toBe(false);
    expect(decoded.recoveredMessage).toBeNull();
  });

  it("recovers from minority bit errors via majority vote", () => {
    const message = "robust";
    const repetitions = 5;
    const { bits, messageByteLength: len } = encodePayload(message, repetitions);

    // Corrupt one bit per group (minority) - majority vote should fix all.
    const corrupted = bits.slice();
    for (let g = 0; g < corrupted.length; g += repetitions) {
      corrupted[g] ^= 1;
    }

    const decoded = decodePayload(corrupted, len, repetitions);
    expect(decoded.checksumValid).toBe(true);
    expect(decoded.recoveredMessage).toBe(message);
  });

  it("majorityVoteGroups collapses repeated bits correctly", () => {
    expect(majorityVoteGroups([1, 1, 0], 3)).toEqual([1]);
    expect(majorityVoteGroups([0, 0, 1], 3)).toEqual([0]);
    expect(majorityVoteGroups([1, 1, 0, 0, 0, 1], 3)).toEqual([1, 0]);
  });

  it("repeatBits expands each bit n times", () => {
    expect(repeatBits([1, 0], 3)).toEqual([1, 1, 1, 0, 0, 0]);
  });

  it("supports non-ASCII (UTF-8) messages", () => {
    const message = "artíst=démo;ライセンス=no-ai";
    const repetitions = 3;
    const { bits, messageByteLength: len } = encodePayload(message, repetitions);
    expect(len).toBe(messageByteLength(message));

    const decoded = decodePayload(bits, len, repetitions);
    expect(decoded.checksumValid).toBe(true);
    expect(decoded.recoveredMessage).toBe(message);
  });

  it("computes payload byte length including the checksum", () => {
    expect(payloadByteLength(10)).toBe(14);
  });

  it("crc32 of known input matches the standard value", () => {
    // CRC-32 of the ASCII string "123456789" is 0xCBF43926.
    const bytes = new TextEncoder().encode("123456789");
    expect(crc32(bytes)).toBe(0xcbf43926);
  });

  it("bytesToBits and bitsToBytes are inverses", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255]);
    const round = bitsToBytes(bytesToBits(bytes));
    expect(Array.from(round)).toEqual(Array.from(bytes));
  });
});
