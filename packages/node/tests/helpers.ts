import type { PixelImage } from "@openartshield/core";

/**
 * Generates a textured synthetic image (gradient + deterministic noise + shapes)
 * suitable for watermarking and transform tests. Mirrors the core test helper so
 * the node package's tests are self-contained.
 */
export function createSyntheticImage(width = 256, height = 256, channels: 3 | 4 = 3): PixelImage {
  let state = 1234567 >>> 0;
  const rand = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const data = new Uint8ClampedArray(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const base = (y * width + x) * channels;
      const gradient = ((x + y) / (width + height)) * 200 + 20;
      const noise = (rand() - 0.5) * 30;
      let r = gradient + noise;
      let g = gradient * 0.8 + noise + 30;
      let b = gradient * 0.6 + noise + 60;
      if ((x - width / 3) ** 2 + (y - height / 3) ** 2 < (width / 6) ** 2) {
        r += 40;
        g -= 20;
      }
      if (((x + y) >> 3) % 2 === 0) b += 25;
      data[base] = r;
      data[base + 1] = g;
      data[base + 2] = b;
      if (channels === 4) data[base + 3] = 255;
    }
  }
  return { width, height, channels, data };
}
