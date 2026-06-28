import type { EmbeddingBackend, PixelImage } from "@openartshield/core";

// Experimental real embedding backend using transformers.js (@huggingface/transformers),
// which runs CLIP via ONNX in Node - no Python.
//
// IMPORTANT:
//   - @huggingface/transformers is an OPTIONAL peer dependency. It is not
//     installed by default (keeps install light, keeps CI on the mock backend).
//     Install it to use this backend:  pnpm add @huggingface/transformers
//   - The first run downloads model weights from the Hugging Face hub and caches
//     them locally. Nothing is bundled or committed.
//   - This path was authored against the transformers.js CLIP API but has not
//     been executed in the development sandbox (no GPU / no weight download).
//     Treat it as experimental and validate locally.

const DEFAULT_MODEL = "Xenova/clip-vit-base-patch32";

// Minimal structural typing for the bits of transformers.js we touch, so this
// file type-checks without the optional dependency installed.
type Tensor = { data: ArrayLike<number> };
type Callable<I, O> = (input: I) => Promise<O>;
type FromPretrained<T> = { from_pretrained(model: string): Promise<T> };

type TransformersModule = {
  RawImage: new (
    data: Uint8ClampedArray,
    width: number,
    height: number,
    channels: number,
  ) => unknown;
  AutoProcessor: FromPretrained<Callable<unknown, unknown>>;
  AutoTokenizer: FromPretrained<(text: string[], options?: unknown) => unknown>;
  CLIPVisionModelWithProjection: FromPretrained<Callable<unknown, { image_embeds: Tensor }>>;
  CLIPTextModelWithProjection: FromPretrained<Callable<unknown, { text_embeds: Tensor }>>;
};

async function loadTransformers(): Promise<TransformersModule> {
  // Variable specifier so bundlers/TS don't try to resolve the optional dep.
  const specifier = "@huggingface/transformers";
  try {
    return (await import(specifier)) as TransformersModule;
  } catch {
    throw new Error(
      "The 'clip' backend requires the optional dependency '@huggingface/transformers'. " +
        "Install it with: pnpm add @huggingface/transformers",
    );
  }
}

export type TransformersBackendOptions = {
  /** Hugging Face model id, e.g. "Xenova/clip-vit-base-patch32". */
  model?: string;
};

/**
 * Create a CLIP embedding backend backed by transformers.js. Models are loaded
 * lazily on first use and cached for the lifetime of the backend.
 */
export function createTransformersEmbeddingBackend(
  options: TransformersBackendOptions = {},
): EmbeddingBackend {
  const model = options.model ?? DEFAULT_MODEL;

  // Lazily-initialized, cached handles.
  let mod: TransformersModule | undefined;
  let processor: Callable<unknown, unknown> | undefined;
  let visionModel: Callable<unknown, { image_embeds: Tensor }> | undefined;
  let tokenizer: ((text: string[], options?: unknown) => unknown) | undefined;
  let textModel: Callable<unknown, { text_embeds: Tensor }> | undefined;

  async function ensureModule(): Promise<TransformersModule> {
    if (!mod) mod = await loadTransformers();
    return mod;
  }

  return {
    id: `transformers:${model}`,

    async embedImage(image: PixelImage): Promise<number[]> {
      const t = await ensureModule();
      if (!processor) processor = await t.AutoProcessor.from_pretrained(model);
      if (!visionModel) {
        visionModel = await t.CLIPVisionModelWithProjection.from_pretrained(model);
      }
      const raw = new t.RawImage(image.data, image.width, image.height, image.channels);
      const inputs = await processor(raw);
      const { image_embeds } = await visionModel(inputs);
      return Array.from(image_embeds.data, Number);
    },

    async embedText(text: string): Promise<number[]> {
      const t = await ensureModule();
      if (!tokenizer) tokenizer = await t.AutoTokenizer.from_pretrained(model);
      if (!textModel) {
        textModel = await t.CLIPTextModelWithProjection.from_pretrained(model);
      }
      const inputs = tokenizer([text], { padding: true, truncation: true });
      const { text_embeds } = await textModel(inputs);
      return Array.from(text_embeds.data, Number);
    },
  };
}
