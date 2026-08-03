// TrustMark data layer: the 100-bit payload schema.
//
// Layout: [data bits][BCH error-correction bits][4 version bits]. The version
// (last 4 bits, values 0-3) selects the trade-off between capacity and
// robustness. Ported from Adobe TrustMark (MIT) - rust/src/bits.rs and
// python/trustmark/datalayer.py.

import { BCH_DECODE_FAILED, createBchCodec, type BchCodec } from "./bch.js";

export const TRUSTMARK_PAYLOAD_BITS = 100;

const VERSION_BITS = 4;

export const TRUSTMARK_VERSIONS = ["BCH_SUPER", "BCH_5", "BCH_4", "BCH_3"] as const;

/** Error-correction schema versions, strongest correction first. */
export type TrustmarkVersion = (typeof TRUSTMARK_VERSIONS)[number];

export function isTrustmarkVersion(value: unknown): value is TrustmarkVersion {
  return typeof value === "string" && (TRUSTMARK_VERSIONS as readonly string[]).includes(value);
}

type VersionSpec = {
  /** Bit flips the BCH code can correct. */
  allowedBitFlips: number;
  /** Usable payload bits. */
  dataBits: number;
  /** The 4-bit version marker at positions 96-99. */
  bitstring: string;
};

const VERSION_SPECS: Record<TrustmarkVersion, VersionSpec> = {
  BCH_SUPER: { allowedBitFlips: 8, dataBits: 40, bitstring: "0000" },
  BCH_5: { allowedBitFlips: 5, dataBits: 61, bitstring: "0001" },
  BCH_4: { allowedBitFlips: 4, dataBits: 68, bitstring: "0010" },
  BCH_3: { allowedBitFlips: 3, dataBits: 75, bitstring: "0011" },
};

export function versionDataBits(version: TrustmarkVersion): number {
  return VERSION_SPECS[version].dataBits;
}

function versionEccBits(version: TrustmarkVersion): number {
  return TRUSTMARK_PAYLOAD_BITS - VERSION_BITS - VERSION_SPECS[version].dataBits;
}

function versionFromBitstring(bits: string): TrustmarkVersion | null {
  for (const version of TRUSTMARK_VERSIONS) {
    if (VERSION_SPECS[version].bitstring === bits) return version;
  }
  return null;
}

// One lazily-created codec per version; table construction is not free.
const codecs = new Map<TrustmarkVersion, BchCodec>();

function codecFor(version: TrustmarkVersion): BchCodec {
  let codec = codecs.get(version);
  if (codec === undefined) {
    codec = createBchCodec(VERSION_SPECS[version].allowedBitFlips);
    codecs.set(version, codec);
  }
  return codec;
}

function assertBitstring(value: string): void {
  if (!/^[01]*$/.test(value)) {
    throw new Error("Bitstrings may only contain '0' and '1' characters.");
  }
}

function packBits(bits: string): Uint8Array {
  const bytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

function unpackBits(bytes: Uint8Array): string {
  let bits = "";
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, "0");
  }
  return bits;
}

/**
 * Wrap a raw data bitstring into the 100-bit watermark payload: pad to the
 * version's capacity, append BCH error-correction bits and the version marker.
 */
export function encodePayload(data: string, version: TrustmarkVersion): string {
  assertBitstring(data);
  const spec = VERSION_SPECS[version];
  if (data.length > spec.dataBits) {
    throw new Error(
      `Payload has ${data.length} bits but ${version} allows at most ${spec.dataBits}.`,
    );
  }

  const padded = data + "0".repeat(spec.dataBits - data.length + (8 - (spec.dataBits % 8)));
  const ecc = codecFor(version).encode(packBits(padded));
  const eccBits = unpackBits(ecc).slice(0, versionEccBits(version));
  return padded.slice(0, spec.dataBits) + eccBits + spec.bitstring;
}

export type DecodedPayload = {
  /** The recovered data bits (version capacity length). */
  data: string;
  version: TrustmarkVersion;
  /** Bit flips the BCH code corrected. */
  correctedBitFlips: number;
};

function decodeWithVersion(payload: string, version: TrustmarkVersion): DecodedPayload | null {
  const spec = VERSION_SPECS[version];
  const eccBitCount = versionEccBits(version);

  const dataBits = payload.slice(0, spec.dataBits) + "0".repeat(8 - (spec.dataBits % 8));
  const eccBits =
    payload.slice(spec.dataBits, spec.dataBits + eccBitCount) +
    "0".repeat(8 - (eccBitCount % 8 === 0 ? 8 : eccBitCount % 8));

  const data = packBits(dataBits);
  const ecc = packBits(eccBits.slice(0, Math.ceil(eccBitCount / 8) * 8));
  const flips = codecFor(version).decode(data, ecc);
  if (flips === BCH_DECODE_FAILED || flips > spec.allowedBitFlips) return null;

  return {
    data: unpackBits(data).slice(0, spec.dataBits),
    version,
    correctedBitFlips: flips,
  };
}

/**
 * Decode a 100-bit watermark payload, correcting up to the version's bit-flip
 * budget. Falls back to trying every other version in case the version marker
 * itself was corrupted. Returns null when the watermark is unrecoverable.
 */
export function decodePayload(payload: string): DecodedPayload | null {
  assertBitstring(payload);
  if (payload.length !== TRUSTMARK_PAYLOAD_BITS) {
    throw new Error(`Payload must be exactly ${TRUSTMARK_PAYLOAD_BITS} bits.`);
  }

  const marked = versionFromBitstring(payload.slice(96)) ?? "BCH_SUPER";
  const first = decodeWithVersion(payload, marked);
  if (first !== null) return first;

  for (const version of ["BCH_3", "BCH_4", "BCH_5", "BCH_SUPER"] as const) {
    if (version === marked) continue;
    const result = decodeWithVersion(payload, version);
    if (result !== null) return result;
  }
  return null;
}

/** Turn the decoder's 100 raw floats into a bitstring (threshold at 0). */
export function bitsFromLogits(logits: ArrayLike<number>): string {
  if (logits.length !== TRUSTMARK_PAYLOAD_BITS) {
    throw new Error(`Expected ${TRUSTMARK_PAYLOAD_BITS} logits, got ${logits.length}.`);
  }
  let bits = "";
  for (let i = 0; i < logits.length; i++) {
    bits += logits[i] < 0 ? "0" : "1";
  }
  return bits;
}

/** Turn a payload bitstring into the encoder's float input (0.0/1.0). */
export function floatsFromBits(bits: string): Float32Array {
  assertBitstring(bits);
  const floats = new Float32Array(bits.length);
  for (let i = 0; i < bits.length; i++) {
    floats[i] = bits[i] === "1" ? 1 : 0;
  }
  return floats;
}

/**
 * Encode text as 7-bit ASCII bits (TrustMark's text mode). BCH_5's 61 data
 * bits fit 8 characters.
 */
export function textToBits(text: string, version: TrustmarkVersion): string {
  const capacity = Math.floor(versionDataBits(version) / 7);
  if (text.length > capacity) {
    throw new Error(`Text has ${text.length} characters but ${version} fits ${capacity}.`);
  }
  let bits = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 127) {
      throw new Error(`Text mode is 7-bit ASCII; "${char}" cannot be encoded.`);
    }
    bits += (code & 127).toString(2).padStart(7, "0");
  }
  return bits;
}

/** Decode 7-bit ASCII bits back to text, trimming NUL padding. */
export function bitsToText(bits: string): string {
  assertBitstring(bits);
  let text = "";
  for (let i = 0; i + 7 <= bits.length; i += 7) {
    text += String.fromCharCode(Number.parseInt(bits.slice(i, i + 7), 2));
  }
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x00+$/g, "").trim();
}
