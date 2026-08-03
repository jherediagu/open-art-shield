import {
  bindDurableDeclaration,
  readImage,
  recoverDurableDeclaration,
  writeImage,
  type RecoverDurableResult,
} from "@openartshield/node";
import { CliError } from "../utils/errors.js";
import { failure, info, success } from "../utils/output.js";
import { manifestFromDeclareFlags, type DeclareOptions } from "./declare.js";

// Durable declarations: `oas declare` writes metadata; platforms strip
// metadata. `oas declare-durable` additionally embeds a 60-bit recovery ID in
// the pixels (TrustMark) pointing at the manifest record in a local store, so
// `oas recover` can find the declaration again after re-encoding or
// screenshots. Needs the optional 'onnxruntime-node' dependency.

export const DEFAULT_MANIFEST_STORE = "oas-manifests";

export type DeclareDurableOptions = Pick<
  DeclareOptions,
  | "input"
  | "title"
  | "creator"
  | "dataMining"
  | "aiTraining"
  | "generativeTraining"
  | "aiInference"
  | "constraint"
> & {
  out: string;
  /** Manifest store directory. Default "oas-manifests". */
  store?: string;
  /** Watermark strength in (0, 1]. */
  strength?: number;
  /** Encoder quality for lossy output formats. */
  quality?: number;
  /** ISO timestamp override (tests); defaults to now. */
  createdAt?: string;
};

export type DeclareDurableResult = {
  outPath: string;
  id: string;
  recordPath: string;
};

export async function runDeclareDurable(
  options: DeclareDurableOptions,
): Promise<DeclareDurableResult> {
  const manifest = manifestFromDeclareFlags(options);
  const image = await readImage(options.input);
  const {
    image: stamped,
    id,
    recordPath,
  } = await bindDurableDeclaration({
    image,
    manifest,
    createdAt: options.createdAt ?? new Date().toISOString(),
    storeDir: options.store ?? DEFAULT_MANIFEST_STORE,
    ...(options.strength !== undefined ? { trustmark: { strength: options.strength } } : {}),
  });
  await writeImage(
    stamped,
    options.out,
    options.quality !== undefined ? { quality: options.quality } : {},
  );
  return { outPath: options.out, id, recordPath };
}

export async function declareDurableCommand(options: DeclareDurableOptions): Promise<void> {
  const result = await runDeclareDurable(options);

  info("OpenArtShield declare-durable (watermark-backed declaration)");
  info("");
  info(`Image: ${options.input}`);
  info(`Recovery ID: ${result.id}`);
  info(`Manifest record: ${result.recordPath}`);
  success(`Stamped image written to ${result.outPath}`);
  info(
    "The declaration now survives metadata stripping: `oas recover <image> --store <dir>` " +
      "finds it again from the pixels alone. To also carry signed C2PA metadata, run " +
      "`oas declare` on this output (watermark first, then sign).",
  );
}

export type RecoverOptions = {
  input: string;
  /** Manifest store directory. Default "oas-manifests". */
  store?: string;
};

export async function runRecover(options: RecoverOptions): Promise<RecoverDurableResult | null> {
  const image = await readImage(options.input);
  return recoverDurableDeclaration(image, options.store ?? DEFAULT_MANIFEST_STORE);
}

export async function recoverCommand(options: RecoverOptions): Promise<void> {
  const result = await runRecover(options);

  info("OpenArtShield recover (durable declaration lookup)");
  info("");
  info(`Image: ${options.input}`);

  if (result === null) {
    failure("No recovery watermark decoded from this image.");
    throw new CliError("No durable declaration recovered.", 2);
  }

  info(`Recovery ID: ${result.id} (corrected bit flips: ${result.correctedBitFlips})`);

  if (result.record === null && result.recordPath === null) {
    failure(
      `The pixels carry ID ${result.id}, but the store has no matching record. ` +
        "Pass the right --store directory.",
    );
    throw new CliError("Manifest record not found in store.", 2);
  }

  if (result.integrity === "hash-mismatch") {
    failure(
      `Store record ${result.recordPath} does NOT hash back to the embedded ID - ` +
        "it was altered after binding. Do not trust its contents.",
    );
    throw new CliError("Manifest record failed integrity check.", 2);
  }

  const record = result.record;
  if (record !== null) {
    info(`Declared: ${record.createdAt}`);
    info(`Title: ${record.manifest.title}`);
    const training = record.manifest.assertions.find((a) => a.label === "cawg.training-mining");
    if (training !== undefined) {
      const entries = (training.data as { entries: Record<string, { use: string }> }).entries;
      for (const [key, entry] of Object.entries(entries)) {
        info(`  ${key}: ${entry.use}`);
      }
    }
  }
  success("Record integrity verified: stored bytes hash back to the embedded ID.");
}
