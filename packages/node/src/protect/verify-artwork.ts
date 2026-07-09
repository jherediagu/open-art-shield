import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { extractWatermark, parseSidecar, type SidecarMetadata } from "@openartshield/core";
import { readImage } from "../io/read-image.js";

export type VerifyArtworkOptions = {
  /** Sidecar path. Defaults to <image-basename>.openartshield.json. */
  sidecarPath?: string;
};

export type VerifyArtworkResult = {
  sidecar: SidecarMetadata;
  recoveredMessage: string | null;
  checksumValid: boolean;
};

function defaultSidecarPath(imagePath: string): string {
  const ext = extname(imagePath);
  const base = ext ? imagePath.slice(0, -ext.length) : imagePath;
  return `${base}.openartshield.json`;
}

/**
 * Verify a protected image against its sidecar: read the sidecar, use its
 * parameters to extract the watermark, and report what came back.
 */
export async function verifyArtwork(
  imagePath: string,
  options: VerifyArtworkOptions = {},
): Promise<VerifyArtworkResult> {
  const sidecarPath = options.sidecarPath ?? defaultSidecarPath(imagePath);

  let sidecarJson: string;
  try {
    sidecarJson = await readFile(sidecarPath, "utf-8");
  } catch {
    throw new Error(`Could not read sidecar at ${sidecarPath}.`);
  }
  const sidecar = parseSidecar(sidecarJson);

  const image = await readImage(imagePath);
  const result = extractWatermark(image, {
    seed: sidecar.seed,
    messageLength: sidecar.messageLength,
    repetitions: sidecar.repetitions,
  });

  return {
    sidecar,
    recoveredMessage: result.recoveredMessage,
    checksumValid: result.checksumValid,
  };
}
