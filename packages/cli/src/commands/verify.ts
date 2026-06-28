import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { extractWatermark, parseSidecar, type SidecarMetadata } from "@openartshield/core";
import { readImage } from "@openartshield/node";
import { CliError } from "../utils/errors.js";
import { failure, info, success } from "../utils/output.js";

export type VerifyOptions = {
  input: string;
  /** Sidecar path. Defaults to <input-basename>.openartshield.json. */
  sidecar?: string;
};

export type VerifyResult = {
  sidecar: SidecarMetadata;
  recoveredMessage: string | null;
  checksumValid: boolean;
};

function defaultSidecarPath(input: string): string {
  const ext = extname(input);
  const base = ext ? input.slice(0, -ext.length) : input;
  return `${base}.openartshield.json`;
}

// Read the sidecar, use its parameters to extract, and report what came back.
export async function runVerify(options: VerifyOptions): Promise<VerifyResult> {
  const sidecarPath = options.sidecar ?? defaultSidecarPath(options.input);

  let sidecarJson: string;
  try {
    sidecarJson = await readFile(sidecarPath, "utf-8");
  } catch {
    throw new CliError(`Could not read sidecar at ${sidecarPath}. Pass one with --sidecar.`);
  }
  const sidecar = parseSidecar(sidecarJson);

  const image = await readImage(options.input);
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

export async function verifyCommand(options: VerifyOptions): Promise<void> {
  const r = await runVerify(options);

  info("OpenArtShield verify");
  info("");
  info(`Image: ${options.input}`);
  info(`Algorithm: ${r.sidecar.algorithm}`);

  if (r.checksumValid && r.recoveredMessage !== null) {
    info("Checksum: valid");
    info(`Recovered message: ${r.recoveredMessage}`);
    success("Watermark verified.");
  } else {
    info("Checksum: invalid");
    failure("Could not verify the watermark (checksum did not validate).");
    throw new CliError("Verification failed.", 2);
  }
}
