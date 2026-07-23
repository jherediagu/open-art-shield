import { createWriteStream } from "node:fs";
import { access, mkdir, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { EmbeddingBackend, PixelImage } from "@openartshield/core";

// Experimental Stable Diffusion VAE-encoder backend (ONNX via onnxruntime-node).
//
// This is the "real surface" backend from docs/RESEARCH.md: Glaze, PhotoGuard
// and StyleGuard all attack the diffusion model's own VAE/latent encoder, not
// CLIP's text-image cosine space. Embedding an image here means encoding it to
// the latent tensor Stable Diffusion actually trains and denoises on, so cloak
// drift measured on this backend is drift on the surface that matters.
//
// IMPORTANT:
//   - 'onnxruntime-node' is an OPTIONAL peer dependency, exactly like
//     '@huggingface/transformers' for the clip backend. Install it to use this
//     backend:  pnpm add onnxruntime-node
//   - The first run downloads the VAE encoder ONNX (~130 MB) from the Hugging
//     Face hub and caches it under ~/.cache/openartshield/. Nothing is bundled.
//   - The standard Optimum exports of the SD VAE encoder sample the latent
//     distribution inside the graph (a RandomNormalLike node), so two encodes
//     of the same image differ slightly. Measured on SD 1.5 at 256x256, that
//     sampling puts a noise floor of ~7e-6 on cosine drift, while a
//     cloak-strength perturbation moves drift by ~3e-1 - five orders of
//     magnitude above the floor. We accept the noise and document it rather
//     than patching the graph.
//   - There is no text encoder here; embedText is intentionally absent.

const DEFAULT_MODEL = "onnx-community/stable-diffusion-v1-5-ONNX";

// The VAE downsamples by 8x; 256 keeps CPU encodes fast (a 32x32x4 = 4096-dim
// latent) while staying meaningful. SD's native 512 is ~4x slower per encode.
const DEFAULT_SIZE = 256;

// Minimal structural typing for the bits of onnxruntime-node we touch, so this
// file type-checks without the optional dependency installed.
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
      "The 'vae' backend requires the optional dependency 'onnxruntime-node'. " +
        "Install it with: pnpm add onnxruntime-node",
    );
  }
}

/**
 * Resize to `size`x`size` with bilinear sampling and pack as a NCHW float32
 * tensor in [-1, 1] - the preprocessing Stable Diffusion's VAE encoder expects.
 * Pure and deterministic; exported for tests.
 */
export function vaeInputFromImage(image: PixelImage, size: number): Float32Array {
  const { width, height, channels, data } = image;
  const out = new Float32Array(3 * size * size);
  const scaleX = width / size;
  const scaleY = height / size;
  for (let y = 0; y < size; y++) {
    const srcY = Math.min(Math.max((y + 0.5) * scaleY - 0.5, 0), height - 1);
    const y0 = Math.floor(srcY);
    const y1 = Math.min(y0 + 1, height - 1);
    const fy = srcY - y0;
    for (let x = 0; x < size; x++) {
      const srcX = Math.min(Math.max((x + 0.5) * scaleX - 0.5, 0), width - 1);
      const x0 = Math.floor(srcX);
      const x1 = Math.min(x0 + 1, width - 1);
      const fx = srcX - x0;
      for (let c = 0; c < 3; c++) {
        const p00 = data[(y0 * width + x0) * channels + c];
        const p01 = data[(y0 * width + x1) * channels + c];
        const p10 = data[(y1 * width + x0) * channels + c];
        const p11 = data[(y1 * width + x1) * channels + c];
        const top = p00 + (p01 - p00) * fx;
        const bottom = p10 + (p11 - p10) * fx;
        const value = top + (bottom - top) * fy;
        out[c * size * size + y * size + x] = (value / 255) * 2 - 1;
      }
    }
  }
  return out;
}

function defaultCacheDir(): string {
  return join(homedir(), ".cache", "openartshield", "vae-encoders");
}

function looksLikeLocalPath(model: string): boolean {
  return model.endsWith(".onnx") || isAbsolute(model) || model.startsWith(".");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the model to a local .onnx file: either the path the caller gave us,
 * or a cached download of `<hub repo>/vae_encoder/model.onnx`.
 */
async function ensureModelFile(model: string, cacheDir: string): Promise<string> {
  if (looksLikeLocalPath(model)) {
    const path = resolve(model);
    if (!(await fileExists(path))) {
      throw new Error(`VAE encoder model file not found: ${path}`);
    }
    return path;
  }
  const target = join(cacheDir, model.replaceAll("/", "__"), "model.onnx");
  if (await fileExists(target)) return target;

  const url = `https://huggingface.co/${model}/resolve/main/vae_encoder/model.onnx`;
  process.stderr.write(`Downloading VAE encoder (~130 MB) from ${url} ...\n`);
  const response = await fetch(url);
  if (!response.ok || response.body === null) {
    throw new Error(
      `Failed to download VAE encoder from "${model}" (HTTP ${response.status}). ` +
        "Expected a Hugging Face repo with vae_encoder/model.onnx, or pass a local .onnx path.",
    );
  }
  await mkdir(dirname(target), { recursive: true });
  const partial = `${target}.download`;
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(partial));
  await rename(partial, target);
  return target;
}

export type VaeBackendOptions = {
  /**
   * Hugging Face repo with a vae_encoder/model.onnx (e.g. the default
   * "onnx-community/stable-diffusion-v1-5-ONNX"), or a local path to the
   * encoder .onnx file itself.
   */
  model?: string;
  /** Square encode size in pixels; must be a multiple of 8. Default 256. */
  size?: number;
  /** Where hub downloads are cached. Default ~/.cache/openartshield/vae-encoders. */
  cacheDir?: string;
};

/**
 * Create a Stable Diffusion VAE-encoder embedding backend. The image is encoded
 * to the diffusion latent (flattened), so drift is measured on the latent
 * surface diffusion models actually use. Loaded lazily on first use.
 */
export function createVaeEmbeddingBackend(options: VaeBackendOptions = {}): EmbeddingBackend {
  const model = options.model ?? DEFAULT_MODEL;
  const size = options.size ?? DEFAULT_SIZE;
  const cacheDir = options.cacheDir ?? defaultCacheDir();
  if (size <= 0 || size % 8 !== 0) {
    throw new Error(`VAE encode size must be a positive multiple of 8, got ${size}.`);
  }

  // Lazily-initialized, cached handle.
  let sessionPromise: Promise<{ ort: OrtModule; session: OrtSession }> | undefined;

  function ensureSession(): Promise<{ ort: OrtModule; session: OrtSession }> {
    if (!sessionPromise) {
      sessionPromise = (async () => {
        const ort = await loadOnnxRuntime();
        const modelPath = await ensureModelFile(model, cacheDir);
        const session = await ort.InferenceSession.create(modelPath);
        return { ort, session };
      })();
      // Let a failed load (missing dep, failed download) be retried.
      sessionPromise.catch(() => {
        sessionPromise = undefined;
      });
    }
    return sessionPromise;
  }

  return {
    id: `vae:${model}`,

    async embedImage(image: PixelImage): Promise<number[]> {
      const { ort, session } = await ensureSession();
      const input = new ort.Tensor("float32", vaeInputFromImage(image, size), [1, 3, size, size]);
      const outputs = await session.run({ [session.inputNames[0]]: input });
      const latent = outputs[session.outputNames[0]];
      return Array.from(latent.data, Number);
    },
  };
}
