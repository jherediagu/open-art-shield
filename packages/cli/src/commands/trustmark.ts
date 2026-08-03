import { isTrustmarkVersion, TRUSTMARK_VERSIONS, type TrustmarkVersion } from "@openartshield/core";
import {
  createTrustmark,
  readImage,
  writeImage,
  type TrustmarkDecodedText,
} from "@openartshield/node";
import { CliError } from "../utils/errors.js";
import { failure, info, success } from "../utils/output.js";

// TrustMark (Adobe, MIT) learned watermarking - the durable-credentials
// watermark backend, next to our classical DCT scheme. Needs the optional
// 'onnxruntime-node' dependency; the ONNX models (~64 MB total) are
// downloaded and cached on first use.

function parseVersion(value: string | undefined): TrustmarkVersion | undefined {
  if (value === undefined) return undefined;
  if (!isTrustmarkVersion(value)) {
    throw new CliError(
      `--ecc must be one of ${TRUSTMARK_VERSIONS.join(", ")}, received "${value}".`,
    );
  }
  return value;
}

export type TrustmarkEmbedOptions = {
  input: string;
  out: string;
  /** 7-bit ASCII text payload (8 chars with the default BCH_5). */
  message: string;
  /** Error-correction schema. Default BCH_5. */
  ecc?: string;
  /** Residual strength in (0, 1]. Default 0.95. */
  strength?: number;
  /** Encoder quality for lossy output formats. */
  quality?: number;
};

export type TrustmarkEmbedResult = {
  outPath: string;
  version: TrustmarkVersion;
};

export async function runTrustmarkEmbed(
  options: TrustmarkEmbedOptions,
): Promise<TrustmarkEmbedResult> {
  const version = parseVersion(options.ecc);
  const trustmark = createTrustmark({
    ...(version !== undefined ? { version } : {}),
    ...(options.strength !== undefined ? { strength: options.strength } : {}),
  });
  const image = await readImage(options.input);
  const stamped = await trustmark.embedText(image, options.message);
  await writeImage(
    stamped,
    options.out,
    options.quality !== undefined ? { quality: options.quality } : {},
  );
  return { outPath: options.out, version: trustmark.version };
}

export async function trustmarkEmbedCommand(options: TrustmarkEmbedOptions): Promise<void> {
  const result = await runTrustmarkEmbed(options);

  info("OpenArtShield trustmark (learned watermark)");
  info("");
  info(`Image: ${options.input}`);
  info(`Schema: ${result.version}`);
  success(`Watermarked image written to ${result.outPath}`);
  info(
    "Note: TrustMark is robust to common transforms, not to a motivated adversary - " +
      "measure it with `oas trustmark-decode` after your own pipeline, and treat it as a " +
      "recoverable pointer, not proof.",
  );
}

export type TrustmarkDecodeOptions = {
  input: string;
};

export async function runTrustmarkDecode(
  options: TrustmarkDecodeOptions,
): Promise<TrustmarkDecodedText | null> {
  const trustmark = createTrustmark();
  return trustmark.decodeText(await readImage(options.input));
}

export async function trustmarkDecodeCommand(options: TrustmarkDecodeOptions): Promise<void> {
  const decoded = await runTrustmarkDecode(options);

  info("OpenArtShield trustmark-decode");
  info("");
  info(`Image: ${options.input}`);
  if (decoded === null) {
    failure("No TrustMark watermark recovered from this image.");
    throw new CliError("No watermark recovered.", 2);
  }
  info(`Schema: ${decoded.version}`);
  info(`Corrected bit flips: ${decoded.correctedBitFlips}`);
  success(`Recovered message: ${decoded.text}`);
}
