import { clonePixelImage } from "../image/clone.js";
import { psnr, ssim } from "../metrics/quality.js";
import { mean } from "../utils/math.js";
import { embeddingDrift } from "../ai/metrics.js";
import type { EmbeddingBackend } from "../ai/types.js";
import type { PixelImage } from "../types.js";
import { boundedNoiseCandidate } from "./perturb.js";
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
 * Experimental embedding cloak via simple seeded random search.
 *
 * For each step it generates a bounded-noise candidate, rejects it if it breaks
 * the visual quality guardrails (PSNR/SSIM), otherwise keeps it if its embedding
 * drift (under `backend`) beats the best so far. If nothing improves, the
 * original is returned and `report.result.improved` is false - we never pretend a
 * no-op is a cloak.
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

  const originalEmbedding = await backend.embedImage(image);
  // Drift of the original against itself is 0 by definition; computed for honesty.
  const initialDrift = embeddingDrift(originalEmbedding, originalEmbedding);

  let best = image;
  let bestDrift = initialDrift;
  let bestPsnr: number | null = null;
  let bestSsim = 1;
  let improved = false;
  let candidatesRejected = 0;

  for (let step = 0; step < steps; step++) {
    const candidate = boundedNoiseCandidate(image, seed, strength, step);

    const candidatePsnr = psnr(image, candidate);
    const candidateSsim = ssim(image, candidate);
    // Quality guardrails: discard anything too visually damaging.
    if (candidatePsnr < minPsnr || candidateSsim < 1 - maxSsimDrop) {
      candidatesRejected += 1;
      continue;
    }

    const candidateEmbedding = await backend.embedImage(candidate);
    const drift = embeddingDrift(originalEmbedding, candidateEmbedding);
    if (drift > bestDrift) {
      best = candidate;
      bestDrift = drift;
      bestPsnr = Number.isFinite(candidatePsnr) ? candidatePsnr : null;
      bestSsim = candidateSsim;
      improved = true;
    }
  }

  // Robustness: how much does the chosen image still drift after transforms?
  const driftAfter: number[] = [];
  for (const transform of transforms) {
    const transformed = await transform.apply(best);
    const transformedEmbedding = await backend.embedImage(transformed);
    driftAfter.push(embeddingDrift(originalEmbedding, transformedEmbedding));
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
        bestDrift,
        psnr: improved ? bestPsnr : null,
        ssim: improved ? bestSsim : 1,
        candidatesRejected,
      },
      robustness: {
        transformsTested: driftAfter.length,
        averageDriftAfterTransforms: mean(driftAfter),
      },
      limitations: [...CLOAK_LIMITATIONS],
    },
  };
}
