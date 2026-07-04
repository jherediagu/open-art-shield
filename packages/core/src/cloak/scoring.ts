import { mean } from "../utils/math.js";

// Multi-model cloak scoring: pure types and aggregation helpers.
//
// A cloak optimized against one embedding model can overfit to that model.
// Scoring each candidate across several models (each with its own EOT drift
// stats) and selecting on the aggregate biases the search toward perturbations
// that move more than one model - an attempt at transfer, not a proof of it.

export type CloakModelScore = {
  /** Model (or mock variant) the scores were measured on. */
  model: string;
  /** Drift of the clean candidate under this model. */
  cleanDrift: number;
  /** Mean drift across the clean candidate plus each EOT variant. */
  averageEotDrift: number;
  /** Minimum drift across the scoring variants - the worst case. */
  minEotDrift: number;
};

/** The search objective: mean of the per-model average EOT drifts. */
export function aggregateAverageDrift(models: CloakModelScore[]): number {
  return mean(models.map((m) => m.averageEotDrift));
}

/**
 * The weakest model's average EOT drift. Reported so a cloak that moves one
 * model a lot and another barely at all cannot hide behind its average.
 */
export function aggregateMinModelDrift(models: CloakModelScore[]): number {
  if (models.length === 0) return 0;
  return Math.min(...models.map((m) => m.averageEotDrift));
}
