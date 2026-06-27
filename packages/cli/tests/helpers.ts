import type { PixelImage } from "@openartshield/core";

/** Generates a textured synthetic image for CLI integration tests. */
export function createSyntheticImage(width = 256, height = 256, channels: 3 | 4 = 3): PixelImage {
  let state = 987654 >>> 0;
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
      data[base] = gradient + noise;
      data[base + 1] = gradient * 0.8 + noise + 30;
      data[base + 2] = gradient * 0.6 + noise + 60;
      if (channels === 4) data[base + 3] = 255;
    }
  }
  return { width, height, channels, data };
}
