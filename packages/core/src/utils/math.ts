// Tiny numeric helpers used across the SDK.

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Round + clamp to a valid 0-255 channel value. */
export function clampByte(value: number): number {
  return clamp(Math.round(value), 0, 255);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

// Population variance/covariance. precomputed means are optional - pass them in
// the SSIM loop to avoid recomputing the same average twice.
export function variance(values: number[], precomputedMean?: number): number {
  if (values.length === 0) return 0;
  const m = precomputedMean ?? mean(values);
  let sum = 0;
  for (const value of values) {
    const d = value - m;
    sum += d * d;
  }
  return sum / values.length;
}

export function covariance(a: number[], b: number[], meanA?: number, meanB?: number): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  const ma = meanA ?? mean(a);
  const mb = meanB ?? mean(b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - ma) * (b[i] - mb);
  }
  return sum / a.length;
}
