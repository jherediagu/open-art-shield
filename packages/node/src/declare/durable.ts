import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DeclareManifestDefinition, PixelImage } from "@openartshield/core";
import { createTrustmark, type TrustmarkOptions } from "../trustmark/trustmark.js";

// Durable credentials: the soft-binding pattern from C2PA 2.x.
//
// Metadata - C2PA manifests, XMP - dies the moment a platform re-encodes the
// image or someone screenshots it. The durable pattern makes the pixels
// themselves carry a recovery pointer: a 60-bit ID embedded as a TrustMark
// watermark, keyed to a manifest record in a store. Recovery decodes the ID
// from a stripped image and looks the record back up.
//
// The ID is the truncated SHA-256 of the record's exact bytes, so recovery
// also integrity-checks the store: a tampered record no longer matches the ID
// embedded in the pixels. This is a *pointer with integrity*, not a
// signature - pair it with `signDeclaration` (C2PA) for provenance that is
// also cryptographically attributable while the metadata survives.

/** Bits of the recovery ID embedded in the watermark (15 hex chars). */
export const DURABLE_ID_BITS = 60;

export const DURABLE_RECORD_VERSION = "1";

export type DurableRecord = {
  version: string;
  /** ISO timestamp. Passed in so record building stays deterministic. */
  createdAt: string;
  manifest: DeclareManifestDefinition;
};

export function serializeDurableRecord(record: DurableRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

/** The recovery ID for a serialized record: truncated SHA-256, 15 hex chars. */
export function durableIdFromRecord(serialized: string): string {
  return createHash("sha256")
    .update(serialized, "utf8")
    .digest("hex")
    .slice(0, DURABLE_ID_BITS / 4);
}

/** Convert a 15-hex-char ID to its 60-bit bitstring (for the watermark). */
export function durableIdToBits(id: string): string {
  if (!/^[0-9a-f]{15}$/.test(id)) {
    throw new Error(`Durable ID must be ${DURABLE_ID_BITS / 4} lowercase hex chars, got "${id}".`);
  }
  return [...id].map((c) => Number.parseInt(c, 16).toString(2).padStart(4, "0")).join("");
}

/** Convert a 60-bit bitstring back to the 15-hex-char ID. */
export function durableIdFromBits(bits: string): string {
  if (!/^[01]{60}$/.test(bits)) {
    throw new Error(`Expected ${DURABLE_ID_BITS} bits, got ${bits.length} characters.`);
  }
  let id = "";
  for (let i = 0; i < bits.length; i += 4) {
    id += Number.parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return id;
}

export type BindDurableOptions = {
  /** The image to stamp. */
  image: PixelImage;
  /** The declaration manifest to make durable. */
  manifest: DeclareManifestDefinition;
  /** ISO timestamp recorded in the manifest record. */
  createdAt: string;
  /** Directory the manifest record is written into (created if missing). */
  storeDir: string;
  /** TrustMark tuning (variant/strength/cache). */
  trustmark?: TrustmarkOptions;
};

export type BindDurableResult = {
  /** The stamped image (watermark carrying the recovery ID). */
  image: PixelImage;
  /** The 15-hex-char recovery ID embedded in the pixels. */
  id: string;
  /** Path of the stored manifest record. */
  recordPath: string;
};

/**
 * Bind a manifest to an image durably: store the record, then embed its ID as
 * a TrustMark watermark. Sign C2PA (if desired) AFTER stamping, so the C2PA
 * hard binding covers the watermarked pixels.
 */
export async function bindDurableDeclaration(
  options: BindDurableOptions,
): Promise<BindDurableResult> {
  const record: DurableRecord = {
    version: DURABLE_RECORD_VERSION,
    createdAt: options.createdAt,
    manifest: options.manifest,
  };
  const serialized = serializeDurableRecord(record);
  const id = durableIdFromRecord(serialized);

  await mkdir(options.storeDir, { recursive: true });
  const recordPath = join(options.storeDir, `${id}.json`);
  await writeFile(recordPath, serialized, "utf8");

  const trustmark = createTrustmark(options.trustmark ?? {});
  const image = await trustmark.embedBits(options.image, durableIdToBits(id));
  return { image, id, recordPath };
}

export type RecoverDurableResult = {
  /** The recovery ID decoded from the pixels. */
  id: string;
  /** Bit flips the watermark ECC corrected while decoding. */
  correctedBitFlips: number;
  /** The stored record, or null when the store has no entry for the ID. */
  record: DurableRecord | null;
  /** Path the record was read from (when found). */
  recordPath: string | null;
  /**
   * "verified" when the stored bytes re-hash to the embedded ID;
   * "hash-mismatch" when the store entry was altered since binding.
   */
  integrity: "verified" | "hash-mismatch" | null;
};

/**
 * Recover a durable declaration from (possibly metadata-stripped) pixels.
 * Returns null when no watermark can be decoded at all.
 */
export async function recoverDurableDeclaration(
  image: PixelImage,
  storeDir: string,
  trustmarkOptions: TrustmarkOptions = {},
): Promise<RecoverDurableResult | null> {
  const trustmark = createTrustmark(trustmarkOptions);
  const decoded = await trustmark.decodeBits(image);
  if (decoded === null) return null;

  const id = durableIdFromBits(decoded.data.slice(0, DURABLE_ID_BITS));
  const recordPath = join(storeDir, `${id}.json`);

  let serialized: string;
  try {
    serialized = await readFile(recordPath, "utf8");
  } catch {
    return {
      id,
      correctedBitFlips: decoded.correctedBitFlips,
      record: null,
      recordPath: null,
      integrity: null,
    };
  }

  const integrity = durableIdFromRecord(serialized) === id ? "verified" : "hash-mismatch";
  let record: DurableRecord | null = null;
  try {
    record = JSON.parse(serialized) as DurableRecord;
  } catch {
    // Unparseable stores still report the hash mismatch below.
  }
  return {
    id,
    correctedBitFlips: decoded.correctedBitFlips,
    record,
    recordPath,
    integrity: record === null ? "hash-mismatch" : integrity,
  };
}
