import { estimateCapacity, messageByteLength, type CapacityEstimate } from "@openartshield/core";
import { readImage } from "@openartshield/node";
import { CliError } from "../utils/errors.js";
import { info } from "../utils/output.js";

export type CapacityOptions = {
  input: string;
  message: string;
  repetitions?: number;
};

// Read the image just for its dimensions, then let core do the math.
export async function runCapacity(options: CapacityOptions): Promise<CapacityEstimate> {
  if (!options.message) {
    throw new CliError("A non-empty --message is required.");
  }
  const image = await readImage(options.input);
  return estimateCapacity({
    width: image.width,
    height: image.height,
    messageByteLength: messageByteLength(options.message),
    ...(options.repetitions !== undefined ? { repetitions: options.repetitions } : {}),
  });
}

export async function capacityCommand(options: CapacityOptions): Promise<void> {
  const c = await runCapacity(options);
  info(`Image: ${c.width}x${c.height}`);
  info(`Blocks: ${c.availableBlocks}`);
  info(`Message bytes: ${c.messageBytes}`);
  info(`Checksum bytes: ${c.checksumBytes}`);
  info(`Payload bits: ${c.payloadBits}`);
  info(`Repetitions: ${c.repetitions}`);
  info(`Required blocks: ${c.requiredBlocks}`);
  info(`Available blocks: ${c.availableBlocks}`);
  info(`Capacity: ${c.fits ? "OK" : "INSUFFICIENT"}`);
  info(`Max message bytes (at ${c.repetitions}x repetitions): ${c.maxMessageBytes}`);
}
