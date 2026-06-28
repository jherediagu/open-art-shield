// The everyday surface - the stuff most people import. The lower-level bits are
// still exported from the package root if you need them.
export { embedWatermark } from "./watermark/embed.js";
export { extractWatermark } from "./watermark/extract.js";
export { runAudit } from "./audit/runner.js";
export { serializeReport, buildSummary } from "./audit/report.js";
export { renderHtmlReport } from "./audit/html.js";
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
