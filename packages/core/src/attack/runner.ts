import { psnr, ssim } from "../metrics/quality.js";
import { mean } from "../utils/math.js";
import { embeddingDrift } from "../ai/metrics.js";
import type { EmbeddingBackend } from "../ai/types.js";
import type { PixelImage } from "../types.js";
import {
  ATTACK_LIMITATIONS,
  ATTACK_REPORT_VERSION,
  type AttackAuditConfig,
  type AttackAuditReport,
  type AttackResult,
} from "./types.js";

/**
 * driftAfter / driftBefore: the fraction of a cloak's embedding drift that
 * survives an attack. Null when driftBefore is zero (no cloak to remove -
 * dividing would report a meaningless Infinity).
 */
export function survivalRatio(driftBefore: number, driftAfter: number): number | null {
  if (driftBefore === 0) return null;
  return driftAfter / driftBefore;
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function meanOrNull(values: number[]): number | null {
  return values.length > 0 ? mean(values) : null;
}

/**
 * Measure how much of a cloak's embedding drift survives a suite of removal
 * attacks. `original` is the artist's image, `cloaked` is the protected output.
 * For each attack: apply it to the cloaked image, re-embed, and report the
 * drift-vs-original that remains and the survival ratio against the pre-attack
 * drift. Lower survival = more of the cloak was stripped.
 *
 * IO-free: the backend and attacks are injected. This is a measurement, not a
 * defense - see ATTACK_LIMITATIONS.
 */
export async function runAttackAudit(
  backend: EmbeddingBackend,
  original: PixelImage,
  cloaked: PixelImage,
  config: AttackAuditConfig = {},
): Promise<AttackAuditReport> {
  const attacks = config.attacks ?? [];

  const originalEmbedding = await backend.embedImage(original);
  const cloakedEmbedding = await backend.embedImage(cloaked);
  const driftBefore = embeddingDrift(originalEmbedding, cloakedEmbedding);

  const results: AttackResult[] = [];
  for (const attack of attacks) {
    const attacked = await attack.apply(cloaked);
    const attackedEmbedding = await backend.embedImage(attacked);
    const driftAfter = embeddingDrift(originalEmbedding, attackedEmbedding);
    const sameShape = cloaked.width === attacked.width && cloaked.height === attacked.height;
    results.push({
      attack: attack.name,
      driftAfter,
      survivalRatio: survivalRatio(driftBefore, driftAfter),
      psnr: sameShape ? finiteOrNull(psnr(cloaked, attacked)) : null,
      ssim: sameShape ? ssim(cloaked, attacked) : null,
    });
  }

  const ratios = results.map((r) => r.survivalRatio).filter((r): r is number => r !== null);

  return {
    version: ATTACK_REPORT_VERSION,
    backend: backend.id,
    image: {
      ...(config.originalPath !== undefined ? { original: config.originalPath } : {}),
      ...(config.candidatePath !== undefined ? { candidate: config.candidatePath } : {}),
    },
    driftBefore,
    results,
    summary: {
      attacksTested: results.length,
      meanSurvivalRatio: meanOrNull(ratios),
      minSurvivalRatio: ratios.length > 0 ? Math.min(...ratios) : null,
    },
    limitations: [...ATTACK_LIMITATIONS],
  };
}
