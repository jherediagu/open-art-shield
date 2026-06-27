import { extractWatermark } from "@openartshield/core";
import { readImage } from "@openartshield/node";
import { CliError } from "../utils/errors.js";
import { failure, info, success } from "../utils/output.js";

export type ExtractOptions = {
  input: string;
  seed: number;
  messageLength: number;
  repetitions?: number;
};

// Try to pull the message back out.
export async function runExtract(
  options: ExtractOptions,
): Promise<{ recoveredMessage: string | null; checksumValid: boolean }> {
  if (!Number.isInteger(options.messageLength) || options.messageLength <= 0) {
    throw new CliError("--message-length must be a positive integer.");
  }

  const image = await readImage(options.input);
  const result = extractWatermark(image, {
    seed: options.seed,
    messageLength: options.messageLength,
    ...(options.repetitions !== undefined ? { repetitions: options.repetitions } : {}),
  });

  return { recoveredMessage: result.recoveredMessage, checksumValid: result.checksumValid };
}

export async function extractCommand(options: ExtractOptions): Promise<void> {
  const { recoveredMessage, checksumValid } = await runExtract(options);
  if (recoveredMessage !== null && checksumValid) {
    success("Watermark recovered (checksum valid).");
    info(`Message: ${recoveredMessage}`);
  } else {
    failure("No valid watermark recovered (checksum invalid).");
    throw new CliError("Extraction failed: checksum did not validate.", 2);
  }
}
