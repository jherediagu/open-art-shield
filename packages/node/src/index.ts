// @openartshield/node - the Node side: image IO and the sharp-based transforms.
// The actual watermarking lives in @openartshield/core; we don't reimplement it.

// Image IO.
export { readImage, decodeImage } from "./io/read-image.js";
export { writeImage, encodeImage, type WriteImageOptions } from "./io/write-image.js";

// Transforms.
export type { TransformGroup, ImageTransform } from "./transforms/types.js";
export {
  jpegCompression,
  jpegQuality95,
  jpegQuality85,
  jpegQuality70,
  jpegTransforms,
} from "./transforms/jpeg.js";
export { resizeRoundTrip, resize75, resize50, resizeTransforms } from "./transforms/resize.js";
export { centerCropResize, centerCrop90, cropTransforms } from "./transforms/crop.js";
export {
  gaussianBlur,
  gaussianBlur075,
  gaussianBlur125,
  blurTransforms,
} from "./transforms/blur.js";
export {
  brightness,
  contrast,
  brightness09,
  brightness11,
  contrast09,
  contrast11,
  colorTransforms,
} from "./transforms/color.js";
export { screenshotSimulation, screenshotTransforms } from "./transforms/screenshot.js";
export {
  defaultTransforms,
  transformsByName,
  selectTransforms,
  composeTransforms,
} from "./transforms/pipeline.js";

// Adversarial removal attacks (for the attack-audit / robustness layer).
export {
  noisyUpscale,
  aggressiveJpeg,
  gaussianPurify,
  noisyUpscaleAttack,
  jpegQuality50Attack,
  jpegQuality30Attack,
  gaussianPurifyAttack,
  defaultAttacks,
  attacksByName,
  ATTACK_SET_NAMES,
  isAttackSetName,
  resolveAttackSet,
  type AttackSetName,
} from "./transforms/attacks.js";

// Audit.
export { auditProtectedImage, embedAndAudit } from "./audit/node-audit-runner.js";

// Experimental real embedding backend (CLIP via transformers.js, optional dep).
export {
  createTransformersEmbeddingBackend,
  type TransformersBackendOptions,
} from "./ai/transformers-backend.js";

// Experimental Stable Diffusion VAE-encoder backend (ONNX, optional dep).
export {
  createVaeEmbeddingBackend,
  vaeInputFromImage,
  type VaeBackendOptions,
} from "./ai/vae-backend.js";

// High-level SDK API: profile-driven protection bundle + companions.
export { protectArtwork } from "./protect/protect-artwork.js";
export type {
  ProtectArtworkOptions,
  ProtectArtworkResult,
  ProtectArtworkTraceResult,
} from "./protect/protect-artwork.js";
export { verifyArtwork } from "./protect/verify-artwork.js";
export type { VerifyArtworkOptions, VerifyArtworkResult } from "./protect/verify-artwork.js";
export { aiAuditArtwork } from "./protect/ai-audit-artwork.js";
export type { AiAuditArtworkOptions } from "./protect/ai-audit-artwork.js";
