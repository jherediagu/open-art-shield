import { clonePixelImage } from "../image/clone.js";
import { psnr, ssim } from "../metrics/quality.js";
import { mean } from "../utils/math.js";
import { embeddingDrift } from "../ai/metrics.js";
import type { Embedding, EmbeddingBackend } from "../ai/types.js";
import type { PixelImage } from "../types.js";
import { boundedNoiseCandidate } from "./perturb.js";
import { DEFAULT_EOT_MODE } from "./eot.js";
import {
  CLOAK_LIMITATIONS,
  CLOAK_REPORT_VERSION,
  DEFAULT_CLOAK_MAX_SSIM_DROP,
  DEFAULT_CLOAK_MIN_PSNR,
  DEFAULT_CLOAK_SEED,
  DEFAULT_CLOAK_STEPS,
  DEFAULT_CLOAK_STRENGTH,
  type CloakConfig,
  type CloakResult,
} from "./types.js";

/**
 * Experimental embedding cloak via simple seeded random search, with optional
 * EOT (Expectation Over Transformation) scoring.
 *
 * For each step it generates a bounded-noise candidate and rejects it if it
 * breaks the visual quality guardrails (PSNR/SSIM) - that check happens before
 * any embedding work. Surviving candidates are scored: with EOT disabled the
 * score is the embedding drift of the clean candidate; with EOT enabled the score
 * is the *average* drift across the clean candidate plus each injected transform
 * of it, so the search favors perturbations that survive everyday image handling.
 * A candidate is kept if its score beats the best so far. If nothing improves,
 * the original is returned and `report.result.improved` is false - we never
 * pretend a no-op is a cloak.
 *
 * Pure with respect to IO: the backend and transforms are injected.
 */
export async function runCloak(
  backend: EmbeddingBackend,
  image: PixelImage,
  config: CloakConfig = {},
): Promise<CloakResult> {
  const strength = config.strength ?? DEFAULT_CLOAK_STRENGTH;
  const steps = config.steps ?? DEFAULT_CLOAK_STEPS;
  const seed = config.seed ?? DEFAULT_CLOAK_SEED;
  const minPsnr = config.minPsnr ?? DEFAULT_CLOAK_MIN_PSNR;
  const maxSsimDrop = config.maxSsimDrop ?? DEFAULT_CLOAK_MAX_SSIM_DROP;
  const transforms = config.transforms ?? [];
  const eotMode = config.eotMode ?? DEFAULT_EOT_MODE;
  const eotTransforms = config.eotTransforms ?? [];

  // Count every embedding evaluation for honest reporting of search cost.
  let embeddingEvaluations = 0;
  const embed = async (img: PixelImage): Promise<Embedding> => {
    embeddingEvaluations += 1;
    return backend.embedImage(img);
  };

  const originalEmbedding = await embed(image);
  // Drift of the original against itself is 0 by definition; computed for honesty.
  const initialDrift = embeddingDrift(originalEmbedding, originalEmbedding);

  // EOT score: mean embedding drift across the clean candidate and each transform
  // of it. With no EOT transforms this is just the clean drift (original behavior).
  const scoreCandidate = async (
    candidate: PixelImage,
  ): Promise<{ cleanDrift: number; average: number; min: number }> => {
    const cleanDrift = embeddingDrift(originalEmbedding, await embed(candidate));
    const drifts = [cleanDrift];
    for (const transform of eotTransforms) {
      const transformed = await transform.apply(candidate);
      drifts.push(embeddingDrift(originalEmbedding, await embed(transformed)));
    }
    return { cleanDrift, average: mean(drifts), min: Math.min(...drifts) };
  };

  let best = image;
  let bestScore = initialDrift;
  let bestCleanDrift = initialDrift;
  let bestEotAverage = initialDrift;
  let bestEotMin = initialDrift;
  let bestPsnr: number | null = null;
  let bestSsim = 1;
  let improved = false;
  let candidatesRejected = 0;

  for (let step = 0; step < steps; step++) {
    const candidate = boundedNoiseCandidate(image, seed, strength, step);

    const candidatePsnr = psnr(image, candidate);
    const candidateSsim = ssim(image, candidate);
    // Quality guardrails: discard anything too visually damaging, before EOT scoring.
    if (candidatePsnr < minPsnr || candidateSsim < 1 - maxSsimDrop) {
      candidatesRejected += 1;
      continue;
    }

    const { cleanDrift, average, min } = await scoreCandidate(candidate);
    if (average > bestScore) {
      best = candidate;
      bestScore = average;
      bestCleanDrift = cleanDrift;
      bestEotAverage = average;
      bestEotMin = min;
      bestPsnr = Number.isFinite(candidatePsnr) ? candidatePsnr : null;
      bestSsim = candidateSsim;
      improved = true;
    }
  }

  // Robustness: how much does the chosen image still drift after transforms?
  const driftAfter: number[] = [];
  for (const transform of transforms) {
    const transformed = await transform.apply(best);
    driftAfter.push(embeddingDrift(originalEmbedding, await embed(transformed)));
  }

  const model = backend.id.startsWith("transformers:")
    ? backend.id.slice("transformers:".length)
    : undefined;

  return {
    image: improved ? best : clonePixelImage(image),
    report: {
      version: CLOAK_REPORT_VERSION,
      input: {
        ...(config.inputPath !== undefined ? { path: config.inputPath } : {}),
        width: image.width,
        height: image.height,
      },
      output: {
        ...(config.outputPath !== undefined ? { path: config.outputPath } : {}),
      },
      backend: {
        id: backend.id,
        ...(model !== undefined ? { model } : {}),
      },
      parameters: { strength, steps, seed, minPsnr, maxSsimDrop },
      result: {
        improved,
        initialDrift,
        bestDrift: bestCleanDrift,
        psnr: improved ? bestPsnr : null,
        ssim: improved ? bestSsim : 1,
        candidatesRejected,
      },
      eot: {
        mode: eotMode,
        transforms: ["clean", ...eotTransforms.map((t) => t.name)],
        cleanDrift: bestCleanDrift,
        averageDrift: bestEotAverage,
        minDrift: bestEotMin,
        embeddingEvaluations,
      },
      robustness: {
        transformsTested: driftAfter.length,
        averageDriftAfterTransforms: mean(driftAfter),
      },
      limitations: [...CLOAK_LIMITATIONS],
    },
  };
}
