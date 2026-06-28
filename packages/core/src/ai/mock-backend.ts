import { toLuminance } from "../image/color.js";
import type { PixelImage } from "../types.js";
import type { Embedding, EmbeddingBackend } from "./types.js";

// Deterministic placeholder backend. It is NOT a learned perceptual model - it
// turns an image into an 8x8 (=64-dim) downsampled-luma feature and L2-normalizes
// it. That makes it: deterministic, content-sensitive (identical images -> drift
// 0, small edits -> small drift, big edits -> bigger drift), and good enough to
// exercise and test the whole ai-audit pipeline without Python or model weights.
//
// Swap in a real CLIP/OpenCLIP backend (transformers.js) behind EmbeddingBackend
// and the runner/report/CLI keep working unchanged.

const GRID = 8;
const DIM = GRID * GRID;

function l2normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const n = Math.sqrt(sum);
  if (n === 0) return vec;
  return vec.map((v) => v / n);
}

function downsampledLumaFeature(image: PixelImage): Embedding {
  const luma = toLuminance(image);
  const { width, height } = image;
  const sums = new Array<number>(DIM).fill(0);
  const counts = new Array<number>(DIM).fill(0);

  for (let y = 0; y < height; y++) {
    const cy = Math.min(GRID - 1, Math.floor((y * GRID) / height));
    for (let x = 0; x < width; x++) {
      const cx = Math.min(GRID - 1, Math.floor((x * GRID) / width));
      const idx = cy * GRID + cx;
      sums[idx] += luma[y * width + x];
      counts[idx] += 1;
    }
  }

  const means = sums.map((s, i) => (counts[i] > 0 ? s / counts[i] : 0));
  // Center before normalizing so the feature reflects texture/contrast rather
  // than just overall brightness.
  const mean = means.reduce((a, b) => a + b, 0) / DIM;
  return l2normalize(means.map((m) => m - mean));
}

function textFeature(text: string): Embedding {
  // Deterministic vector from the string. Purely to exercise the prompt path;
  // it shares no meaningful space with the image feature (this is a mock).
  let state = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    state ^= text.charCodeAt(i);
    state = Math.imul(state, 16777619) >>> 0;
  }
  const vec = new Array<number>(DIM);
  for (let i = 0; i < DIM; i++) {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    vec[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
  }
  return l2normalize(vec);
}

/** Create the deterministic mock embedding backend (id "mock"). */
export function createMockEmbeddingBackend(): EmbeddingBackend {
  return {
    id: "mock",
    embedImage: downsampledLumaFeature,
    embedText: textFeature,
  };
}
