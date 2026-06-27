import { crc32 } from "../utils/crc32.js";
import { bitsToBytes, bytesToBits, bytesToUint32, uint32ToBytes } from "../utils/bits.js";

// Payload pipeline:
//   message -> utf8 -> + crc32 -> bits -> repeat each bit N times
// and back on the way out:
//   slot bits -> majority vote -> bytes -> check crc -> message
//
// The repetition + majority vote is a dead-simple error-correcting code. It's
// not fancy but it's surprisingly effective against the kind of noise JPEG and
// resizing introduce.

const CHECKSUM_BYTES = 4;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: false });

export function payloadByteLength(messageByteLength: number): number {
  return messageByteLength + CHECKSUM_BYTES;
}

export function repeatedBitLength(messageByteLength: number, repetitions: number): number {
  return payloadByteLength(messageByteLength) * 8 * repetitions;
}

/**
 * Turn a message into the repeated bit stream we actually embed. Also hands back
 * the UTF-8 byte length, which the caller has to remember for extraction.
 */
export function encodePayload(
  message: string,
  repetitions: number,
): { bits: number[]; messageByteLength: number } {
  if (repetitions < 1 || !Number.isInteger(repetitions)) {
    throw new Error(`repetitions must be a positive integer, received ${repetitions}`);
  }
  const messageBytes = textEncoder.encode(message);
  const checksum = uint32ToBytes(crc32(messageBytes));

  const payload = new Uint8Array(messageBytes.length + checksum.length);
  payload.set(messageBytes, 0);
  payload.set(checksum, messageBytes.length);

  const baseBits = bytesToBits(payload);
  const bits = repeatBits(baseBits, repetitions);
  return { bits, messageByteLength: messageBytes.length };
}

/**
 * Decode a recovered slot-bit stream back into a message. `slotBits` is one bit
 * per embedded slot (already in embedding order, not yet majority-voted).
 */
export function decodePayload(
  slotBits: number[],
  messageByteLength: number,
  repetitions: number,
): { recoveredMessage: string | null; checksumValid: boolean; payloadBits: number[] } {
  const payloadBits = majorityVoteGroups(slotBits, repetitions);
  const expectedBits = payloadByteLength(messageByteLength) * 8;
  // Pad/trim so a short read still gives us whole bytes to checksum.
  const normalized = payloadBits.slice(0, expectedBits);
  while (normalized.length < expectedBits) normalized.push(0);

  const bytes = bitsToBytes(normalized);
  const messageBytes = bytes.slice(0, messageByteLength);
  const checksumBytes = bytes.slice(messageByteLength, messageByteLength + CHECKSUM_BYTES);

  const checksumValid = crc32(messageBytes) === bytesToUint32(checksumBytes, 0);
  const recoveredMessage = checksumValid ? textDecoder.decode(messageBytes) : null;
  return { recoveredMessage, checksumValid, payloadBits: normalized };
}

export function repeatBits(bits: number[], repetitions: number): number[] {
  const out = new Array<number>(bits.length * repetitions);
  let k = 0;
  for (const bit of bits) {
    for (let r = 0; r < repetitions; r++) out[k++] = bit;
  }
  return out;
}

// Collapse each group of `repetitions` bits to a single bit. Ties (even counts)
// fall back to 0.
export function majorityVoteGroups(bits: number[], repetitions: number): number[] {
  const groups = Math.floor(bits.length / repetitions);
  const out = new Array<number>(groups);
  for (let g = 0; g < groups; g++) {
    let ones = 0;
    for (let r = 0; r < repetitions; r++) {
      ones += bits[g * repetitions + r] & 1;
    }
    out[g] = ones * 2 > repetitions ? 1 : 0;
  }
  return out;
}

export function messageByteLength(message: string): number {
  return textEncoder.encode(message).length;
}
