import { clampByte } from "../utils/math.js";
import type { PixelImage } from "../types.js";

// We watermark the luminance plane, not RGB directly - same idea as JPEG, and it
// spreads the change across channels so it reads as a brightness tweak rather
// than a color shift. Rec. 601 weights.

const R_WEIGHT = 0.299;
const G_WEIGHT = 0.587;
const B_WEIGHT = 0.114;

/** Pull out the luma plane as a width*height Float64Array (row-major). */
export function toLuminance(image: PixelImage): Float64Array {
  const { width, height, channels, data } = image;
  const luma = new Float64Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const base = p * channels;
    luma[p] = R_WEIGHT * data[base] + G_WEIGHT * data[base + 1] + B_WEIGHT * data[base + 2];
  }
  return luma;
}

// Add the per-pixel luma change (newLuma - originalLuma) back onto R, G and B.
// Same delta on all three keeps the color the same and only moves brightness -
// that's the trick that lets a luma-domain watermark survive the round trip.
// Alpha is copied through untouched.
export function applyLuminanceDelta(
  image: PixelImage,
  originalLuma: Float64Array,
  newLuma: Float64Array,
): PixelImage {
  const { width, height, channels, data } = image;
  const out = new Uint8ClampedArray(data.length);
  for (let p = 0; p < width * height; p++) {
    const base = p * channels;
    const delta = newLuma[p] - originalLuma[p];
    out[base] = clampByte(data[base] + delta);
    out[base + 1] = clampByte(data[base + 1] + delta);
    out[base + 2] = clampByte(data[base + 2] + delta);
    if (channels === 4) {
      out[base + 3] = data[base + 3];
    }
  }
  return { width, height, channels, data: out };
}
