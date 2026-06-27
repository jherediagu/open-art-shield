import { mean } from "../utils/math.js";
import { bytesToBits } from "../utils/bits.js";
import { encodePayload, messageByteLength } from "../watermark/payload.js";

// How well did the watermark come back? bit accuracy, message match, and a
// couple of aggregate helpers the audit summary uses.

/** Fraction of matching bits in [0, 1]. Compares up to the shorter array. */
export function bitAccuracy(expected: number[], actual: number[]): number {
  const length = Math.min(expected.length, actual.length);
  if (length === 0) return 0;
  let matches = 0;
  for (let i = 0; i < length; i++) {
    if ((expected[i] & 1) === (actual[i] & 1)) matches++;
  }
  return matches / length;
}

// Bit accuracy against what the message *should* have produced. We re-derive the
// expected payload from the message (it's deterministic) so there's nothing to
// store on the side. `recoveredBits` are the post-vote payload bits.
export function bitAccuracyForMessage(
  expectedMessage: string,
  recoveredBits: number[],
  repetitions: number,
): number {
  const { bits } = encodePayload(expectedMessage, repetitions);
  // bits is repeated; take one per group to line up with recoveredBits.
  const expectedPayloadBits: number[] = [];
  for (let i = 0; i < bits.length; i += repetitions) {
    expectedPayloadBits.push(bits[i]);
  }
  return bitAccuracy(expectedPayloadBits, recoveredBits);
}

export function messageRecovered(expected: string, recovered: string | null): boolean {
  return recovered !== null && recovered === expected;
}

export function averageBitAccuracy(accuracies: number[]): number {
  return mean(accuracies);
}

export function recoveryCount(flags: boolean[]): number {
  return flags.reduce((count, flag) => count + (flag ? 1 : 0), 0);
}

// A few small helpers exposed for tests/diagnostics.
export function expectedPayloadBits(message: string): number[] {
  const { bits } = encodePayload(message, 1);
  return bits;
}

export function expectedMessageByteLength(message: string): number {
  return messageByteLength(message);
}

export function rawMessageBits(messageBytes: Uint8Array): number[] {
  return bytesToBits(messageBytes);
}
