import type { SidecarMetadata } from "@openartshield/core";
import { verifyArtwork } from "@openartshield/node";
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

// Thin wrapper over the @openartshield/node SDK (`verifyArtwork`): the CLI adds
// the flag hint to the missing-sidecar error and owns terminal output.
export async function runVerify(options: VerifyOptions): Promise<VerifyResult> {
  try {
    return await verifyArtwork(options.input, {
      ...(options.sidecar !== undefined ? { sidecarPath: options.sidecar } : {}),
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Could not read sidecar")) {
      throw new CliError(`${error.message} Pass one with --sidecar.`);
    }
    throw error;
  }
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
