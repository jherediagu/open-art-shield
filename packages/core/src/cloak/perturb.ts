import { clampByte } from "../utils/math.js";
import { Prng } from "../utils/prng.js";
import type { PixelImage } from "../types.js";

// Deterministic, visually-bounded perturbation. Adds uniform noise in
// [-strength, +strength] to each RGB channel (alpha untouched), seeded by
// (seed, step) so every candidate is reproducible and distinct. Pure: no IO,
// no models. This is intentionally a dumb black-box candidate generator - a
// real optimizer comes later.
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
