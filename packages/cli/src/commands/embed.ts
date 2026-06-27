import { embedWatermark } from "@openartshield/core";
import { readImage, writeImage } from "@openartshield/node";
import { CliError } from "../utils/errors.js";
import { success } from "../utils/output.js";

export type EmbedOptions = {
  input: string;
  message: string;
  seed: number;
  strength?: number;
  repetitions?: number;
  out: string;
  quality?: number;
};

// Read -> embed -> write. Returns stats so tests (and callers) can assert on them
// instead of scraping stdout.
export async function runEmbed(
  options: EmbedOptions,
): Promise<{ outPath: string; bitsEmbedded: number; blocksUsed: number }> {
  if (!options.message) {
    throw new CliError("A non-empty --message is required.");
  }

  const image = await readImage(options.input);
  const {
    image: protectedImage,
    bitsEmbedded,
    blocksUsed,
  } = embedWatermark(image, {
    message: options.message,
    seed: options.seed,
    ...(options.strength !== undefined ? { strength: options.strength } : {}),
    ...(options.repetitions !== undefined ? { repetitions: options.repetitions } : {}),
  });

  await writeImage(protectedImage, options.out, {
    ...(options.quality !== undefined ? { quality: options.quality } : {}),
  });

  return { outPath: options.out, bitsEmbedded, blocksUsed };
}

// The actual command: run it and print a line.
export async function embedCommand(options: EmbedOptions): Promise<void> {
  const { outPath, bitsEmbedded, blocksUsed } = await runEmbed(options);
  success(
    `Embedded ${bitsEmbedded} bits across ${blocksUsed} blocks. Protected image written to ${outPath}`,
  );
}
