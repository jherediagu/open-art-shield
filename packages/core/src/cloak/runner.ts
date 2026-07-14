import { clonePixelImage } from "../image/clone.js";
import { psnr, ssim } from "../metrics/quality.js";
import { mean } from "../utils/math.js";
import { embeddingDrift } from "../ai/metrics.js";
import type { Embedding, EmbeddingBackend } from "../ai/types.js";
import type { PixelImage } from "../types.js";
import { boundedNoiseCandidate, mutateCandidate } from "./perturb.js";
import { DEFAULT_EOT_MODE } from "./eot.js";
import { aggregateAverageDrift, aggregateMinModelDrift, type CloakModelScore } from "./scoring.js";
import {
  CLOAK_LIMITATIONS,
  CLOAK_REPORT_VERSION,
  DEFAULT_CLOAK_MAX_SSIM_DROP,
  DEFAULT_CLOAK_MIN_PSNR,
  DEFAULT_CLOAK_MUTATION_RATE,
  DEFAULT_CLOAK_OPTIMIZER,
  DEFAULT_CLOAK_SEED,
  DEFAULT_CLOAK_STEPS,
  DEFAULT_CLOAK_STRENGTH,
  type CloakConfig,
  type CloakResult,
} from "./types.js";

// "transformers:<model>" -> "<model>" for display; mock ids stay verbatim so a
// mock variant is never mistaken for a real model in the report.
function modelName(backend: EmbeddingBackend): string {
  return backend.id.startsWith("transformers:")
    ? backend.id.slice("transformers:".length)
    : backend.id;
}

/**
 * Experimental embedding cloak, with optional EOT (Expectation Over
 * Transformation) and multi-model scoring, and a choice of search strategy.
 *
 * For each of `steps` candidates it applies the visual quality guardrails
 * (PSNR/SSIM) before any embedding work, then scores survivors per model: the
 * drift of the clean candidate plus each injected EOT transform of it, averaged.
 * The candidate's aggregate score is the mean of those per-model averages, so
 * with extra score backends the search favors perturbations that move *several*
 * models instead of overfitting to one.
 *
 * The `optimizer` controls how candidates are generated. "random" (default)
 * samples each candidate independently. "greedy" seeds with one random candidate
 * and then hill-climbs: each subsequent candidate is a mutation of the best so
 * far, accepted only if its aggregate score improves. Both evaluate the same
 * number of candidates, so their embedding cost is comparable. If nothing
 * improves, the original is returned and `report.result.improved` is false - we
 * never pretend a no-op is a cloak.
 *
 * Pure with respect to IO: backends and transforms are injected.
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
  const scoreBackends = config.scoreBackends ?? [];
  const allBackends = [backend, ...scoreBackends];
  const optimizer = config.optimizer ?? DEFAULT_CLOAK_OPTIMIZER;
  const mutationRate = config.mutationRate ?? DEFAULT_CLOAK_MUTATION_RATE;

  // Count every embedding evaluation (across all models) for honest cost reporting.
  let embeddingEvaluations = 0;
  const embedWith = async (b: EmbeddingBackend, img: PixelImage): Promise<Embedding> => {
    embeddingEvaluations += 1;
    return b.embedImage(img);
  };

  // Each model's view of the original, computed once.
  const originalEmbeddings: Embedding[] = [];
  for (const b of allBackends) {
    originalEmbeddings.push(await embedWith(b, image));
  }
  // Drift of the original against itself is 0 by definition; computed for honesty.
  const initialDrift = embeddingDrift(originalEmbeddings[0], originalEmbeddings[0]);

  // Score a candidate: each EOT transform is applied once, then every variant
  // (clean first) is embedded under every model. Per model that yields clean,
  // average, and minimum EOT drift; the aggregate is the mean of the per-model
  // averages.
  const scoreCandidate = async (
    candidate: PixelImage,
  ): Promise<{ models: CloakModelScore[]; aggregate: number }> => {
    const variants: PixelImage[] = [candidate];
    for (const transform of eotTransforms) {
      variants.push(await transform.apply(candidate));
    }
    const models: CloakModelScore[] = [];
    for (let i = 0; i < allBackends.length; i++) {
      const drifts: number[] = [];
      for (const variant of variants) {
        drifts.push(
          embeddingDrift(originalEmbeddings[i], await embedWith(allBackends[i], variant)),
        );
      }
      models.push({
        model: modelName(allBackends[i]),
        cleanDrift: drifts[0],
        averageEotDrift: mean(drifts),
        minEotDrift: Math.min(...drifts),
      });
    }
    return { models, aggregate: aggregateAverageDrift(models) };
  };

  let best = image;
  // The unchanged original drifts 0 under every model.
  let bestModels: CloakModelScore[] = allBackends.map((b) => ({
    model: modelName(b),
    cleanDrift: initialDrift,
    averageEotDrift: initialDrift,
    minEotDrift: initialDrift,
  }));
  let bestAggregate = initialDrift;
  let bestPsnr: number | null = null;
  let bestSsim = 1;
  let improved = false;
  let candidatesRejected = 0;
  let acceptedImprovements = 0;

  // Both strategies evaluate `steps` candidates, so their cost is comparable.
  // "random" samples every candidate independently; "greedy" seeds with one
  // random candidate and then hill-climbs by mutating the best so far.
  for (let step = 0; step < steps; step++) {
    const candidate =
      optimizer === "greedy" && step > 0
        ? mutateCandidate(image, best, seed, strength, step, mutationRate)
        : boundedNoiseCandidate(image, seed, strength, step);

    const candidatePsnr = psnr(image, candidate);
    const candidateSsim = ssim(image, candidate);
    // Quality guardrails: discard anything too visually damaging, before scoring.
    if (candidatePsnr < minPsnr || candidateSsim < 1 - maxSsimDrop) {
      candidatesRejected += 1;
      continue;
    }

    const { models, aggregate } = await scoreCandidate(candidate);
    if (aggregate > bestAggregate) {
      best = candidate;
      bestModels = models;
      bestAggregate = aggregate;
      bestPsnr = Number.isFinite(candidatePsnr) ? candidatePsnr : null;
      bestSsim = candidateSsim;
      improved = true;
      acceptedImprovements += 1;
    }
  }

  // Robustness: how much does the chosen image still drift (primary model) after
  // the full transform suite? An independent post-hoc check, not the search score.
  const driftAfter: number[] = [];
  for (const transform of transforms) {
    const transformed = await transform.apply(best);
    driftAfter.push(embeddingDrift(originalEmbeddings[0], await embedWith(backend, transformed)));
  }

  const model = backend.id.startsWith("transformers:")
    ? backend.id.slice("transformers:".length)
    : undefined;
  const primary = bestModels[0];

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
      parameters: { strength, steps, seed, minPsnr, maxSsimDrop, optimizer },
      result: {
        improved,
        initialDrift,
        bestDrift: primary.cleanDrift,
        psnr: improved ? bestPsnr : null,
        ssim: improved ? bestSsim : 1,
        candidatesRejected,
        acceptedImprovements,
      },
      eot: {
        mode: eotMode,
        transforms: ["clean", ...eotTransforms.map((t) => t.name)],
        cleanDrift: primary.cleanDrift,
        averageDrift: primary.averageEotDrift,
        minDrift: primary.minEotDrift,
        embeddingEvaluations,
      },
      scoring: {
        mode: scoreBackends.length > 0 ? "multi-model" : "single-model",
        primaryModel: modelName(backend),
        scoreModels: scoreBackends.map(modelName),
        models: bestModels,
        aggregateAverageDrift: bestAggregate,
        aggregateMinModelDrift: aggregateMinModelDrift(bestModels),
      },
      robustness: {
        transformsTested: driftAfter.length,
        averageDriftAfterTransforms: mean(driftAfter),
      },
      limitations: [...CLOAK_LIMITATIONS],
    },
  };
}
