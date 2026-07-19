// @openartshield/core - pure watermarking SDK. No fs, no Node APIs; works on raw
// PixelImage data so it runs in the browser, workers, wherever.

// Common stuff first.
export * from "./sdk.js";

// Types.
export type {
  PixelImage,
  CoefficientPosition,
  WatermarkConfig,
  WatermarkExtractionConfig,
  WatermarkEmbeddingResult,
  WatermarkExtractionResult,
} from "./types.js";
export {
  DEFAULT_STRENGTH,
  DEFAULT_REPETITIONS,
  DEFAULT_BLOCK_SIZE,
  DEFAULT_COEFFICIENT_A,
  DEFAULT_COEFFICIENT_B,
} from "./types.js";

// Errors.
export {
  OpenArtShieldError,
  InvalidImageError,
  InvalidConfigError,
  CapacityError,
  DctError,
} from "./errors.js";

// Image helpers.
export { validatePixelImage, isValidPixelImage } from "./image/validation.js";
export { pixelCount, getPixel } from "./image/pixel-image.js";
export { toLuminance, applyLuminanceDelta } from "./image/color.js";

// Watermark primitives.
export { forwardDct, inverseDct, BLOCK_SIZE } from "./watermark/dct.js";
export {
  encodePayload,
  decodePayload,
  repeatBits,
  majorityVoteGroups,
  payloadByteLength,
  repeatedBitLength,
} from "./watermark/payload.js";
export { countBlocks, blocksPerRow, selectBlockOrder } from "./watermark/coefficients.js";
export type { CapacityEstimate, CapacityParams } from "./watermark/capacity.js";

// Utilities.
export { crc32 } from "./utils/crc32.js";
export { Prng, seededPermutation } from "./utils/prng.js";
export { bytesToBits, bitsToBytes } from "./utils/bits.js";
export { clamp, clampByte } from "./utils/math.js";

// Sidecar metadata.
export { SIDECAR_ALGORITHM, buildSidecar, serializeSidecar, parseSidecar } from "./sidecar.js";
export type { SidecarMetadata, BuildSidecarParams } from "./sidecar.js";

// Audit (runAudit, serializeReport, buildSummary are on the SDK surface above).
export { REPORT_VERSION } from "./audit/types.js";
export type { ImageTransform, AuditConfig, AuditResult, AuditReport } from "./audit/types.js";

// AI-perception measurement (runEmbeddingAudit etc. are on the SDK surface above).
export { EMBEDDING_REPORT_VERSION, EMBEDDING_AUDIT_LIMITATIONS } from "./ai/types.js";
export type {
  Embedding,
  EmbeddingBackend,
  EmbeddingAuditConfig,
  EmbeddingAuditReport,
  TransformDriftResult,
} from "./ai/types.js";
export {
  TRANSFER_LIMITATIONS,
  transferRatio,
  buildTransferComparison,
  buildTransferReport,
} from "./ai/transfer.js";
export type { TransferComparison, TransferSummary, TransferReport } from "./ai/transfer.js";

// Adversarial removal-attack audit (runAttackAudit etc. are on the SDK surface above).
export { ATTACK_REPORT_VERSION, ATTACK_LIMITATIONS } from "./attack/types.js";
export type {
  AttackAuditConfig,
  AttackAuditReport,
  AttackResult,
  RemovalAttack,
} from "./attack/types.js";

// Experimental embedding cloak (runCloak etc. are on the SDK surface above).
export {
  CLOAK_REPORT_VERSION,
  CLOAK_LIMITATIONS,
  DEFAULT_CLOAK_STRENGTH,
  DEFAULT_CLOAK_STEPS,
  DEFAULT_CLOAK_SEED,
  DEFAULT_CLOAK_MIN_PSNR,
  DEFAULT_CLOAK_MAX_SSIM_DROP,
  DEFAULT_CLOAK_OPTIMIZER,
  DEFAULT_CLOAK_MUTATION_RATE,
  CLOAK_OPTIMIZERS,
  isCloakOptimizer,
  resolveCloakOptimizer,
} from "./cloak/types.js";
export type { CloakConfig, CloakReport, CloakResult, CloakOptimizer } from "./cloak/types.js";
export {
  EOT_MODES,
  DEFAULT_EOT_MODE,
  EOT_TRANSFORM_NAMES,
  isEotMode,
  resolveEotMode,
  eotTransformNames,
} from "./cloak/eot.js";
export type { EotMode } from "./cloak/eot.js";
export { aggregateAverageDrift, aggregateMinModelDrift } from "./cloak/scoring.js";
export type { CloakModelScore } from "./cloak/scoring.js";

// Protection profiles (pure layer combinations; orchestration lives in the CLI).
export {
  PROTECTION_PROFILE_NAMES,
  PROTECTION_PROFILES,
  DEFAULT_PROTECTION_PROFILE,
  isProtectionProfileName,
  resolveProtectionProfile,
} from "./profiles.js";
export type {
  ProtectionProfileName,
  ProtectionProfileLayers,
  ProtectionProfile,
} from "./profiles.js";
