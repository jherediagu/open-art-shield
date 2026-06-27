import { Prng } from "../src/utils/prng.js";
import type { PixelImage } from "../src/types.js";

/**
 * Generates a synthetic but textured image suitable for DCT watermarking tests.
 *
 * Flat solid-color images make poor watermarking subjects (mid-frequency DCT
 * coefficients are near zero), so this builds a gradient overlaid with mild
 * deterministic noise and a few geometric shapes to provide real texture.
 */
export function createSyntheticImage(
  width = 128,
  height = 128,
  channels: 3 | 4 = 3,
  seed = 42,
): PixelImage {
  const prng = new Prng(seed);
  const data = new Uint8ClampedArray(width * height * channels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const base = (y * width + x) * channels;

      // Diagonal gradient.
      const gradient = ((x + y) / (width + height)) * 200 + 20;
      // Mild deterministic noise for texture.
      const noise = (prng.next() - 0.5) * 30;

      let r = gradient + noise;
      let g = gradient * 0.8 + noise + 30;
      let b = gradient * 0.6 + noise + 60;

      // A couple of geometric shapes to add stronger edges.
      const inCircle = (x - width / 3) ** 2 + (y - height / 3) ** 2 < (width / 6) ** 2;
      if (inCircle) {
        r += 40;
        g -= 20;
      }
      const inStripe = ((x + y) >> 3) % 2 === 0;
      if (inStripe) {
        b += 25;
      }

      data[base] = clamp8(r);
      data[base + 1] = clamp8(g);
      data[base + 2] = clamp8(b);
      if (channels === 4) {
        data[base + 3] = 255;
      }
    }
  }

  return { width, height, channels, data };
}

function clamp8(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** Counts how many channel values differ between two same-sized images. */
export function countDifferences(a: PixelImage, b: PixelImage): number {
  let count = 0;
  for (let i = 0; i < a.data.length; i++) {
    if (a.data[i] !== b.data[i]) count++;
  }
  return count;
}
