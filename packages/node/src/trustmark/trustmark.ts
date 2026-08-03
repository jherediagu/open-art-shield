import { createWriteStream } from "node:fs";
import { access, mkdir, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  bitsFromLogits,
  bitsToText,
  clampByte,
  decodeTrustmarkPayload,
  encodeTrustmarkPayload,
  floatsFromBits,
  textToBits,
  TRUSTMARK_PAYLOAD_BITS,
  type DecodedPayload,
  type PixelImage,
  type TrustmarkVersion,
} from "@openartshield/core";
import { vaeInputFromImage } from "../ai/vae-backend.js";

// TrustMark watermarking (Adobe, MIT - arXiv:2311.18297) as an alternative,
// learned watermark backend next to our classical DCT scheme.
//
// The heavy lifting happens in two ONNX models (encoder ~17 MB, decoder
// ~47 MB) downloaded on first use from Adobe's CDN - the same files the
// official Rust implementation fetches. 'onnxruntime-node' is an OPTIONAL
// dependency, exactly like for the vae backend. The 100-bit payload schema
// (BCH error correction + version marker) is our pure-TS port in
// @openartshield/core, cross-checked against the canonical Python
// implementation.
//
// Pipeline (mirrors rust/src/lib.rs):
//   encode: image -> 256x256 [-1,1] NCHW + payload floats -> encoder
//           -> residual = clamp(strength * (out - in), ±0.2)
//           -> bilinear-upscale residual to the original size -> add.
//   decode: image -> 256x256 [-1,1] NCHW -> decoder -> 100 logits
//           -> threshold -> BCH-correct -> payload.

const MODEL_BASE_URL = "https://cai-watermark.adobe.net/watermarking/trustmark-models";

/** Model input side length; TrustMark always encodes through 256x256. */
const MODEL_SIZE = 256;

const RESIDUAL_CLAMP = 0.2;

export const TRUSTMARK_VARIANTS = ["Q", "B", "C", "P"] as const;

export type TrustmarkVariant = (typeof TRUSTMARK_VARIANTS)[number];

// Minimal structural typing for the bits of onnxruntime-node we touch.
type OrtTensorValue = { data: ArrayLike<number>; dims: readonly number[] };
type OrtSession = {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensorValue>>;
};
type OrtModule = {
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
  InferenceSession: { create(path: string): Promise<OrtSession> };
};

async function loadOnnxRuntime(): Promise<OrtModule> {
  // Variable specifier so bundlers/TS don't try to resolve the optional dep.
  const specifier = "onnxruntime-node";
  try {
    return (await import(specifier)) as OrtModule;
  } catch {
    throw new Error(
      "TrustMark requires the optional dependency 'onnxruntime-node'. " +
        "Install it with: pnpm add onnxruntime-node",
    );
  }
}

function defaultCacheDir(): string {
  return join(homedir(), ".cache", "openartshield", "trustmark");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureModelFile(
  filename: string,
  cacheDir: string,
  baseUrl: string,
): Promise<string> {
  const target = join(cacheDir, filename);
  if (await fileExists(target)) return target;

  const url = `${baseUrl}/${filename}`;
  process.stderr.write(`Downloading TrustMark model ${filename} from ${url} ...\n`);
  const response = await fetch(url);
  if (!response.ok || response.body === null) {
    throw new Error(`Failed to download TrustMark model "${filename}" (HTTP ${response.status}).`);
  }
  await mkdir(dirname(target), { recursive: true });
  const partial = `${target}.download`;
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(partial));
  await rename(partial, target);
  return target;
}

/**
 * Bilinearly resize a NCHW float plane stack (3 x size x size) to
 * 3 x height x width. Pure and deterministic; exported for tests.
 */
export function upscaleResidual(
  residual: Float32Array,
  size: number,
  width: number,
  height: number,
): Float32Array {
  const out = new Float32Array(3 * width * height);
  const scaleX = size / width;
  const scaleY = size / height;
  for (let y = 0; y < height; y++) {
    const srcY = Math.min(Math.max((y + 0.5) * scaleY - 0.5, 0), size - 1);
    const y0 = Math.floor(srcY);
    const y1 = Math.min(y0 + 1, size - 1);
    const fy = srcY - y0;
    for (let x = 0; x < width; x++) {
      const srcX = Math.min(Math.max((x + 0.5) * scaleX - 0.5, 0), size - 1);
      const x0 = Math.floor(srcX);
      const x1 = Math.min(x0 + 1, size - 1);
      const fx = srcX - x0;
      for (let c = 0; c < 3; c++) {
        const plane = c * size * size;
        const p00 = residual[plane + y0 * size + x0];
        const p01 = residual[plane + y0 * size + x1];
        const p10 = residual[plane + y1 * size + x0];
        const p11 = residual[plane + y1 * size + x1];
        const top = p00 + (p01 - p00) * fx;
        const bottom = p10 + (p11 - p10) * fx;
        out[c * width * height + y * width + x] = top + (bottom - top) * fy;
      }
    }
  }
  return out;
}

/**
 * Add a full-resolution residual (model space, [-1,1] units) onto an image.
 * A residual of r in model space moves a byte by r * 127.5. Alpha is
 * preserved. Pure and deterministic; exported for tests.
 */
export function applyResidualToImage(image: PixelImage, residual: Float32Array): PixelImage {
  const { width, height, channels, data } = image;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const base = (y * width + x) * channels;
      for (let c = 0; c < 3; c++) {
        const delta = residual[c * width * height + y * width + x] * 127.5;
        out[base + c] = clampByte(data[base + c] + delta);
      }
      if (channels === 4) out[base + 3] = data[base + 3];
    }
  }
  return { width, height, channels, data: out };
}

export type TrustmarkOptions = {
  /** Model variant. Only "Q" is currently wired up end-to-end. Default "Q". */
  variant?: TrustmarkVariant;
  /** Error-correction schema. Default "BCH_5" (61 payload bits, 5 flips). */
  version?: TrustmarkVersion;
  /** Residual strength in [0, 1]; the reference default is 0.95. */
  strength?: number;
  /** Where model downloads are cached. Default ~/.cache/openartshield/trustmark. */
  cacheDir?: string;
  /** Override the model CDN (e.g. a mirror). */
  modelBaseUrl?: string;
};

export type TrustmarkDecodedText = {
  text: string;
  version: TrustmarkVersion;
  correctedBitFlips: number;
};

export type Trustmark = {
  readonly variant: TrustmarkVariant;
  readonly version: TrustmarkVersion;
  /** Embed a raw bitstring (up to the version's capacity). */
  embedBits(image: PixelImage, bits: string): Promise<PixelImage>;
  /** Embed 7-bit ASCII text (8 chars with BCH_5). */
  embedText(image: PixelImage, text: string): Promise<PixelImage>;
  /** Decode and BCH-correct the payload; null when no watermark survives. */
  decodeBits(image: PixelImage): Promise<DecodedPayload | null>;
  /** Decode as text mode; null when no watermark survives. */
  decodeText(image: PixelImage): Promise<TrustmarkDecodedText | null>;
};

function assertNormalAspect(image: PixelImage): void {
  const aspect = image.width / image.height;
  if (aspect < 0.5 || aspect > 2.0) {
    throw new Error(
      `TrustMark embedding currently supports aspect ratios between 1:2 and 2:1, ` +
        `got ${image.width}x${image.height}. Crop the image first.`,
    );
  }
}

/** Create a TrustMark encoder/decoder. Models are lazy-loaded on first use. */
export function createTrustmark(options: TrustmarkOptions = {}): Trustmark {
  const variant = options.variant ?? "Q";
  if (!(TRUSTMARK_VARIANTS as readonly string[]).includes(variant)) {
    throw new Error(`Unknown TrustMark variant "${variant}". Use one of: Q, B, C, P.`);
  }
  if (variant !== "Q") {
    throw new Error(
      `TrustMark variant "${variant}" is not wired up yet; only "Q" is supported today.`,
    );
  }
  const version = options.version ?? "BCH_5";
  const strength = options.strength ?? 0.95;
  if (!(strength > 0 && strength <= 1)) {
    throw new Error(`TrustMark strength must be in (0, 1], got ${strength}.`);
  }
  const cacheDir = options.cacheDir ?? defaultCacheDir();
  const baseUrl = options.modelBaseUrl ?? MODEL_BASE_URL;

  let sessionsPromise:
    Promise<{ ort: OrtModule; encoder: OrtSession; decoder: OrtSession }> | undefined;

  function ensureSessions(): Promise<{ ort: OrtModule; encoder: OrtSession; decoder: OrtSession }> {
    if (!sessionsPromise) {
      sessionsPromise = (async () => {
        const ort = await loadOnnxRuntime();
        const [encoderPath, decoderPath] = await Promise.all([
          ensureModelFile(`encoder_${variant}.onnx`, cacheDir, baseUrl),
          ensureModelFile(`decoder_${variant}.onnx`, cacheDir, baseUrl),
        ]);
        const [encoder, decoder] = await Promise.all([
          ort.InferenceSession.create(encoderPath),
          ort.InferenceSession.create(decoderPath),
        ]);
        return { ort, encoder, decoder };
      })();
      // Let a failed load (missing dep, failed download) be retried.
      sessionsPromise.catch(() => {
        sessionsPromise = undefined;
      });
    }
    return sessionsPromise;
  }

  async function embedBits(image: PixelImage, bits: string): Promise<PixelImage> {
    assertNormalAspect(image);
    const payload = encodeTrustmarkPayload(bits, version);
    const { ort, encoder } = await ensureSessions();

    // Same preprocessing as the SD VAE backend: 256x256 bilinear, [-1,1] NCHW.
    const input = vaeInputFromImage(image, MODEL_SIZE);
    const imageTensor = new ort.Tensor("float32", input, [1, 3, MODEL_SIZE, MODEL_SIZE]);
    const bitsTensor = new ort.Tensor("float32", floatsFromBits(payload), [
      1,
      TRUSTMARK_PAYLOAD_BITS,
    ]);

    // The reference graphs name their inputs "onnx::Concat_0" (image) and
    // "onnx::Gemm_1" (secret); fall back to positional order.
    const [imageInput, bitsInput] =
      encoder.inputNames.length === 2 ? encoder.inputNames : ["onnx::Concat_0", "onnx::Gemm_1"];
    const outputs = await encoder.run({ [imageInput]: imageTensor, [bitsInput]: bitsTensor });
    const stamped = outputs[encoder.outputNames[0]].data;

    const residual = new Float32Array(input.length);
    for (let i = 0; i < residual.length; i++) {
      const value = strength * (Number(stamped[i]) - input[i]);
      residual[i] = Math.min(Math.max(value, -RESIDUAL_CLAMP), RESIDUAL_CLAMP);
    }

    const fullResidual = upscaleResidual(residual, MODEL_SIZE, image.width, image.height);
    return applyResidualToImage(image, fullResidual);
  }

  async function decodeBits(image: PixelImage): Promise<DecodedPayload | null> {
    const { ort, decoder } = await ensureSessions();
    const input = vaeInputFromImage(image, MODEL_SIZE);
    const imageTensor = new ort.Tensor("float32", input, [1, 3, MODEL_SIZE, MODEL_SIZE]);
    const outputs = await decoder.run({ [decoder.inputNames[0]]: imageTensor });
    const logits = outputs[decoder.outputNames[0]].data;
    return decodeTrustmarkPayload(bitsFromLogits(Array.from(logits, Number)));
  }

  return {
    variant,
    version,

    embedBits,

    async embedText(image: PixelImage, text: string): Promise<PixelImage> {
      return embedBits(image, textToBits(text, version));
    },

    decodeBits,

    async decodeText(image: PixelImage): Promise<TrustmarkDecodedText | null> {
      const decoded = await decodeBits(image);
      if (decoded === null) return null;
      return {
        text: bitsToText(decoded.data),
        version: decoded.version,
        correctedBitFlips: decoded.correctedBitFlips,
      };
    },
  };
}
