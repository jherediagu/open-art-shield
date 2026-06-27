import { InvalidImageError } from "../errors.js";
import { toLuminance } from "../image/color.js";
import { covariance, mean, variance } from "../utils/math.js";
import type { PixelImage } from "../types.js";

// PSNR + SSIM, both comparing two images of the same size. The audit uses these
// to say "how badly did this transform mangle the image".

const MAX_PIXEL = 255;

function assertSameShape(a: PixelImage, b: PixelImage): void {
  if (a.width !== b.width || a.height !== b.height) {
    throw new InvalidImageError(
      `Quality metrics require matching dimensions: ${a.width}x${a.height} vs ${b.width}x${b.height}`,
    );
  }
}

// PSNR in dB over RGB. Infinity for identical images. Roughly, 40+ dB is
// "you won't see the difference".
export function psnr(reference: PixelImage, candidate: PixelImage): number {
  assertSameShape(reference, candidate);

  const { width, height, channels: refChannels, data: refData } = reference;
  const { channels: candChannels, data: candData } = candidate;

  let sumSquaredError = 0;
  let samples = 0;
  for (let p = 0; p < width * height; p++) {
    const refBase = p * refChannels;
    const candBase = p * candChannels;
    for (let c = 0; c < 3; c++) {
      const diff = refData[refBase + c] - candData[candBase + c];
      sumSquaredError += diff * diff;
      samples++;
    }
  }

  if (sumSquaredError === 0) return Infinity;
  const mse = sumSquaredError / samples;
  return 10 * Math.log10((MAX_PIXEL * MAX_PIXEL) / mse);
}

// SSIM on luma, averaged over non-overlapping 8x8 windows. Returns [-1, 1], 1 ==
// identical. Not the textbook Gaussian-windowed SSIM, but close enough and
// deterministic, which is what we care about for reproducible reports.
export function ssim(reference: PixelImage, candidate: PixelImage): number {
  assertSameShape(reference, candidate);

  const C1 = (0.01 * MAX_PIXEL) ** 2;
  const C2 = (0.03 * MAX_PIXEL) ** 2;
  const window = 8;
  const { width, height } = reference;

  const lumaRef = toLuminance(reference);
  const lumaCand = toLuminance(candidate);

  const scores: number[] = [];
  for (let by = 0; by + window <= height; by += window) {
    for (let bx = 0; bx + window <= width; bx += window) {
      const a: number[] = [];
      const b: number[] = [];
      for (let y = 0; y < window; y++) {
        const row = (by + y) * width + bx;
        for (let x = 0; x < window; x++) {
          a.push(lumaRef[row + x]);
          b.push(lumaCand[row + x]);
        }
      }
      const ma = mean(a);
      const mb = mean(b);
      const va = variance(a, ma);
      const vb = variance(b, mb);
      const cov = covariance(a, b, ma, mb);

      const numerator = (2 * ma * mb + C1) * (2 * cov + C2);
      const denominator = (ma * ma + mb * mb + C1) * (va + vb + C2);
      scores.push(numerator / denominator);
    }
  }

  // Fall back to a single full-image window if the image is smaller than 8x8.
  if (scores.length === 0) return 1;
  return mean(scores);
}
