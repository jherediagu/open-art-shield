import { clampByte } from "../utils/math.js";
import { Prng } from "../utils/prng.js";
import type { PixelImage } from "../types.js";

// Deterministic, visually-bounded perturbation. Adds uniform noise in
// [-strength, +strength] to each RGB channel (alpha untouched), seeded by
// (seed, step) so every candidate is reproducible and distinct. Pure: no IO,
// no models. This is the starting point for both the random search and the
// greedy optimizer's seed candidate.
export function boundedNoiseCandidate(
  image: PixelImage,
  seed: number,
  strength: number,
  step: number,
): PixelImage {
  const prng = new Prng((seed ^ Math.imul(step + 1, 0x9e3779b1)) >>> 0);
  const { width, height, channels, data } = image;
  const out = new Uint8ClampedArray(data.length);

  for (let p = 0; p < width * height; p++) {
    const base = p * channels;
    for (let c = 0; c < 3; c++) {
      const delta = Math.round((prng.next() * 2 - 1) * strength);
      out[base + c] = clampByte(data[base + c] + delta);
    }
    if (channels === 4) out[base + 3] = data[base + 3];
  }

  return { width, height, channels, data: out };
}

// A neighbour of `candidate` for the greedy optimizer: re-sample a random subset
// of pixels (each independently chosen with probability `mutationRate`) as a
// fresh bounded perturbation of the *original* image, keeping the rest of
// `candidate` untouched.
//
// Sampling the mutated pixels against `original` (not against `candidate`) keeps
// the hard invariant that every RGB channel stays within [-strength, +strength]
// of the original no matter how many times we mutate - the greedy search can
// never drift past the visual budget. Deterministic in (seed, iteration).
export function mutateCandidate(
  original: PixelImage,
  candidate: PixelImage,
  seed: number,
  strength: number,
  iteration: number,
  mutationRate: number,
): PixelImage {
  const prng = new Prng((seed ^ Math.imul(iteration + 1, 0x85ebca6b)) >>> 0);
  const { width, height, channels } = original;
  const orig = original.data;
  const out = new Uint8ClampedArray(candidate.data);

  for (let p = 0; p < width * height; p++) {
    if (prng.next() >= mutationRate) continue;
    const base = p * channels;
    for (let c = 0; c < 3; c++) {
      const delta = Math.round((prng.next() * 2 - 1) * strength);
      out[base + c] = clampByte(orig[base + c] + delta);
    }
  }

  return { width, height, channels, data: out };
}
