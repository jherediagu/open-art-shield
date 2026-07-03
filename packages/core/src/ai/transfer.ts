import { mean } from "../utils/math.js";
import { cosineSimilarity } from "./metrics.js";
import type { Embedding } from "./types.js";

// Transfer measurement: does embedding drift measured on one model also appear
// on another? A cloak optimized against a single CLIP variant may only move that
// variant's embedding; measuring the same image pair on additional models is the
// honest check. This module holds the pure math and report shapes - the CLI
// orchestrates which models to load, and the backends live in @openartshield/node.
//
// Transfer measurement does not prove protection. It only measures whether drift
// appears across the selected embedding models.

export type TransferComparison = {
  /** Model id the comparison embeddings came from. */
  model: string;
  /** Cosine similarity between original and candidate under this model. */
  cosineSimilarity: number;
  /** Drift = 1 - cosineSimilarity under this model. */
  drift: number;
  /**
   * comparison drift / primary drift. Null when the primary drift is zero -
   * there is nothing to transfer, and dividing by zero would report Infinity.
   */
  transferRatio: number | null;
};

export type TransferSummary = {
  primaryDrift: number;
  averageTransferDrift: number;
  minimumTransferDrift: number;
};

export type TransferReport = {
  /** Model the primary drift was measured on. */
  primaryModel: string;
  comparisons: TransferComparison[];
  summary: TransferSummary;
  limitations: string[];
};

export const TRANSFER_LIMITATIONS: readonly string[] = [
  "Transfer drift is measured only across the selected embedding models.",
  "This does not prove protection against training or style mimicry.",
  "CLIP-family transfer is only a proxy for broader model behavior.",
];

/**
 * comparisonDrift / primaryDrift, or null when primaryDrift is zero (nothing to
 * transfer; avoids reporting Infinity).
 */
export function transferRatio(primaryDrift: number, comparisonDrift: number): number | null {
  if (primaryDrift === 0) return null;
  return comparisonDrift / primaryDrift;
}

/** Compare an original/candidate embedding pair from one comparison model. */
export function buildTransferComparison(
  model: string,
  originalEmbedding: Embedding,
  candidateEmbedding: Embedding,
  primaryDrift: number,
): TransferComparison {
  const cosine = cosineSimilarity(originalEmbedding, candidateEmbedding);
  const drift = 1 - cosine;
  return {
    model,
    cosineSimilarity: cosine,
    drift,
    transferRatio: transferRatio(primaryDrift, drift),
  };
}

/** Assemble the transfer block for an embedding-audit report. */
export function buildTransferReport(
  primaryModel: string,
  primaryDrift: number,
  comparisons: TransferComparison[],
): TransferReport {
  const drifts = comparisons.map((c) => c.drift);
  return {
    primaryModel,
    comparisons,
    summary: {
      primaryDrift,
      averageTransferDrift: mean(drifts),
      minimumTransferDrift: drifts.length > 0 ? Math.min(...drifts) : 0,
    },
    limitations: [...TRANSFER_LIMITATIONS],
  };
}
