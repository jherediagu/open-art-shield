import type { Embedding } from "./types.js";

// Pure vector metrics for comparing embeddings.

function assertSameLength(a: Embedding, b: Embedding): void {
  if (a.length !== b.length) {
    throw new Error(`Embedding length mismatch: ${a.length} vs ${b.length}`);
  }
}

export function dot(a: Embedding, b: Embedding): number {
  assertSameLength(a, b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export function norm(a: Embedding): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * a[i];
  return Math.sqrt(sum);
}

/** Cosine similarity in [-1, 1]. Returns 0 if either vector is all-zeros. */
export function cosineSimilarity(a: Embedding, b: Embedding): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  // Clamp against tiny floating-point overshoot past +/-1.
  const cos = dot(a, b) / (na * nb);
  return cos > 1 ? 1 : cos < -1 ? -1 : cos;
}

export function euclideanDistance(a: Embedding, b: Embedding): number {
  assertSameLength(a, b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Drift = 1 - cosine similarity. 0 = same direction, up to 2 = opposite. */
export function embeddingDrift(a: Embedding, b: Embedding): number {
  return 1 - cosineSimilarity(a, b);
}
