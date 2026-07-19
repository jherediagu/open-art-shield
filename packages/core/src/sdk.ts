// The everyday surface - the stuff most people import. The lower-level bits are
// still exported from the package root if you need them.
export { embedWatermark } from "./watermark/embed.js";
export { extractWatermark } from "./watermark/extract.js";
export { runAudit } from "./audit/runner.js";
export { serializeReport, buildSummary } from "./audit/report.js";
export { renderHtmlReport } from "./audit/html.js";
export { runEmbeddingAudit } from "./ai/runner.js";
export { createMockEmbeddingBackend } from "./ai/mock-backend.js";
export { serializeEmbeddingReport, renderEmbeddingHtmlReport } from "./ai/report.js";
export { cosineSimilarity, euclideanDistance, embeddingDrift } from "./ai/metrics.js";
export { runCloak } from "./cloak/runner.js";
export { boundedNoiseCandidate, mutateCandidate } from "./cloak/perturb.js";
export { serializeCloakReport, renderCloakHtmlReport } from "./cloak/report.js";
export { runAttackAudit, survivalRatio } from "./attack/runner.js";
export { serializeAttackReport, renderAttackHtmlReport } from "./attack/report.js";
export { psnr, ssim } from "./metrics/quality.js";
export {
  bitAccuracy,
  bitAccuracyForMessage,
  messageRecovered,
  averageBitAccuracy,
  recoveryCount,
} from "./metrics/recovery.js";
export { messageByteLength } from "./watermark/payload.js";
export { estimateCapacity } from "./watermark/capacity.js";
export { createPixelImage } from "./image/pixel-image.js";
export { clonePixelImage } from "./image/clone.js";
