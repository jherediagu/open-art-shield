import {
  bitsFromLogits,
  bitsToText,
  decodeTrustmarkPayload,
  type DecodedPayload,
  type PixelImage,
} from "@openartshield/core";

// In-browser TrustMark verification. The decoder ONNX (~47 MB, fetched from
// Adobe's CDN and cached by the browser) runs through 'onnxruntime-web' - an
// OPTIONAL dependency, lazy-loaded exactly like 'onnxruntime-node' in the
// Node package. WebGPU is used when available, with a WASM fallback.
//
// Decode-only on purpose: the browser use case is the public verifier
// ("does this image carry a watermark, and what does it say?") with the
// pixels never leaving the page. Embedding stays in @openartshield/node.

const MODEL_BASE_URL = "https://cai-watermark.adobe.net/watermarking/trustmark-models";

const MODEL_SIZE = 256;

// Minimal structural typing for the bits of onnxruntime-web we touch.
type OrtTensorValue = { data: ArrayLike<number> };
type OrtSession = {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensorValue>>;
};
type OrtModule = {
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
  InferenceSession: {
    create(model: string | ArrayBuffer, options?: Record<string, unknown>): Promise<OrtSession>;
  };
};

async function loadOnnxRuntimeWeb(): Promise<OrtModule> {
  // Variable specifier so bundlers don't force the optional dep.
  const specifier = "onnxruntime-web";
  try {
    return (await import(/* @vite-ignore */ specifier)) as OrtModule;
  } catch {
    throw new Error(
      "In-browser TrustMark verification requires the optional dependency " +
        "'onnxruntime-web'. Install it with: pnpm add onnxruntime-web",
    );
  }
}

/**
 * Resize to MODEL_SIZE x MODEL_SIZE with bilinear sampling and pack as a NCHW
 * float32 tensor in [-1, 1] - TrustMark's expected input. Pure; exported for
 * tests. (Same preprocessing as the Node backend.)
 */
export function trustmarkInputFromImage(image: PixelImage): Float32Array {
  const { width, height, channels, data } = image;
  const size = MODEL_SIZE;
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

export type TrustmarkWebDecoderOptions = {
  /** URL of the decoder ONNX. Default: Adobe's CDN, variant Q. */
  modelUrl?: string;
  /** onnxruntime execution providers, tried in order. Default WebGPU->WASM. */
  executionProviders?: string[];
};

export type TrustmarkWebDecoder = {
  /** Decode and BCH-correct the payload; null when no watermark survives. */
  decodeBits(image: PixelImage): Promise<DecodedPayload | null>;
  /** Decode as 7-bit ASCII text mode; null when no watermark survives. */
  decodeText(
    image: PixelImage,
  ): Promise<{ text: string; version: string; correctedBitFlips: number } | null>;
};

/** Create an in-browser TrustMark decoder. The model loads on first use. */
export function createTrustmarkWebDecoder(
  options: TrustmarkWebDecoderOptions = {},
): TrustmarkWebDecoder {
  const modelUrl = options.modelUrl ?? `${MODEL_BASE_URL}/decoder_Q.onnx`;
  const executionProviders = options.executionProviders ?? ["webgpu", "wasm"];

  let sessionPromise: Promise<{ ort: OrtModule; session: OrtSession }> | undefined;

  function ensureSession(): Promise<{ ort: OrtModule; session: OrtSession }> {
    if (!sessionPromise) {
      sessionPromise = (async () => {
        const ort = await loadOnnxRuntimeWeb();
        const session = await ort.InferenceSession.create(modelUrl, { executionProviders });
        return { ort, session };
      })();
      sessionPromise.catch(() => {
        sessionPromise = undefined;
      });
    }
    return sessionPromise;
  }

  async function decodeBits(image: PixelImage): Promise<DecodedPayload | null> {
    const { ort, session } = await ensureSession();
    const tensor = new ort.Tensor("float32", trustmarkInputFromImage(image), [
      1,
      3,
      MODEL_SIZE,
      MODEL_SIZE,
    ]);
    const outputs = await session.run({ [session.inputNames[0]]: tensor });
    const logits = outputs[session.outputNames[0]].data;
    return decodeTrustmarkPayload(bitsFromLogits(Array.from(logits, Number)));
  }

  return {
    decodeBits,

    async decodeText(image: PixelImage) {
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
