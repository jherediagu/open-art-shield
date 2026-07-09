import { writeFile } from "node:fs/promises";
import { extname } from "node:path";
import {
  DEFAULT_PROTECTION_PROFILE,
  DEFAULT_REPETITIONS,
  DEFAULT_STRENGTH,
  EOT_TRANSFORM_NAMES,
  PROTECTION_PROFILE_NAMES,
  PROTECTION_PROFILES,
  buildSidecar,
  embedWatermark,
  estimateCapacity,
  isProtectionProfileName,
  messageByteLength,
  renderCloakHtmlReport,
  renderHtmlReport,
  resolveEotMode,
  runCloak,
  serializeCloakReport,
  serializeReport,
  serializeSidecar,
  type AuditReport,
  type CloakReport,
  type EmbeddingAuditReport,
  type PixelImage,
  type ProtectionProfile,
  type SidecarMetadata,
} from "@openartshield/core";
import { readImage } from "../io/read-image.js";
import { writeImage } from "../io/write-image.js";
import { auditProtectedImage } from "../audit/node-audit-runner.js";
import { defaultTransforms, selectTransforms } from "../transforms/pipeline.js";
import { aiAuditArtwork } from "./ai-audit-artwork.js";
import { verifyArtwork } from "./verify-artwork.js";
import { resolveBackend, resolveScoreBackends } from "./backends.js";

// The high-level SDK entry point: pass an image and a protection profile, get a
// complete bundle (protected image, sidecar, audit report, optional cloak and
// ai-audit reports) without hand-orchestrating the individual layers.
//
// A profile is a workflow, not a guarantee - every layer stays an experimental,
// measurable signal.

export type ProtectArtworkOptions = {
  /** Protection profile (default "creator-balanced"). */
  profile?: string;
  /** Message to embed (UTF-8). */
  message: string;
  /** Deterministic seed for watermark block selection (also seeds the cloak). */
  seed: number;
  /** Path for the protected output image. */
  outputPath: string;
  /** Watermark embedding strength (default 8). Not the cloak strength. */
  strength?: number;
  /** Repetition coding count (default 5). */
  repetitions?: number;
  /** Audit JSON report path. Defaults to <output-basename>.audit.json. */
  jsonPath?: string;
  /**
   * HTML reports. `true` writes every profile-relevant HTML report at its
   * default path; a string sets the audit HTML path explicitly.
   */
  html?: string | boolean;
  /** Sidecar path. Defaults to <output-basename>.openartshield.json. */
  sidecarPath?: string;
  /** Skip writing the sidecar entirely. */
  noSidecar?: boolean;
  /** Store the message inside the sidecar (off by default). */
  storeMessage?: boolean;
  /** ISO timestamp for the sidecar; injected for deterministic tests. */
  now?: string;
  /** Tool version recorded in the sidecar (default "0.1.0"). */
  sidecarVersion?: string;
  /** Embedding backend for the cloak/measure layers: "mock" (default) or "clip". */
  backend?: string;
  /** Primary model id for the clip backend. */
  model?: string;
  /** Extra models for multi-model cloak scoring (cloak layer). */
  scoreModels?: string[];
  /** Extra models for ai-audit transfer measurement (measure layer). */
  compareModels?: string[];
  /** EOT robustness mode for the cloak layer: "none" (default), "mild", "standard". */
  eot?: string;
  /** Max per-channel pixel change for cloak candidates (default 4). */
  cloakStrength?: number;
  /** Number of cloak candidate perturbations (default 8). */
  steps?: number;
};

export type ProtectArtworkTraceResult = {
  outputPath: string;
  jsonPath: string;
  htmlPath?: string;
  sidecarPath?: string;
  report: AuditReport;
  sidecar?: SidecarMetadata;
  messageBytes: number;
};

export type ProtectArtworkResult = {
  profile: ProtectionProfile;
  protect: ProtectArtworkTraceResult;
  /** Present when the profile runs the cloak layer. */
  cloak?: {
    report: CloakReport;
    /** Whether the cloak improved drift and was baked into the output. */
    applied: boolean;
    jsonPath: string;
    htmlPath?: string;
  };
  /** Present when the profile runs the measure (ai-audit) layer. */
  aiAudit?: {
    report: EmbeddingAuditReport;
    jsonPath: string;
    htmlPath?: string;
  };
  /** Present when the profile verifies the output against its sidecar. */
  verification?: {
    checksumValid: boolean;
    recoveredMessage: string | null;
  };
};

/** Drop a path's extension and append `suffix`, e.g. protected.png -> protected.audit.json. */
function withSuffix(outputPath: string, suffix: string): string {
  const ext = extname(outputPath);
  const base = ext ? outputPath.slice(0, -ext.length) : outputPath;
  return base + suffix;
}

function resolveProfile(name: string | undefined): ProtectionProfile {
  const value = name ?? DEFAULT_PROTECTION_PROFILE;
  if (!isProtectionProfileName(value)) {
    throw new Error(
      `Unknown protection profile "${value}". Use one of: ${PROTECTION_PROFILE_NAMES.join(", ")}.`,
    );
  }
  return PROTECTION_PROFILES[value];
}

/** The Trace + Audit core: capacity check -> embed -> write -> audit -> reports -> sidecar. */
async function traceAndAudit(
  inputPath: string,
  options: ProtectArtworkOptions,
  sourceImage: PixelImage | undefined,
): Promise<ProtectArtworkTraceResult> {
  if (!options.message) {
    throw new Error("A non-empty message is required.");
  }

  const repetitions = options.repetitions ?? DEFAULT_REPETITIONS;
  const strength = options.strength ?? DEFAULT_STRENGTH;
  const messageBytes = messageByteLength(options.message);

  const image = sourceImage ?? (await readImage(inputPath));

  // Capacity check first, so we never write a half-baked image.
  const capacity = estimateCapacity({
    width: image.width,
    height: image.height,
    messageByteLength: messageBytes,
    repetitions,
  });
  if (!capacity.fits) {
    throw new Error(
      `Message does not fit: needs ${capacity.requiredBlocks} blocks but the image has ` +
        `${capacity.availableBlocks}. At ${repetitions}x repetitions the maximum message is ` +
        `${capacity.maxMessageBytes} bytes (got ${messageBytes}). Use a larger image, a shorter ` +
        `message, or fewer repetitions.`,
    );
  }

  const { image: protectedImage } = embedWatermark(image, {
    message: options.message,
    seed: options.seed,
    strength,
    repetitions,
  });
  await writeImage(protectedImage, options.outputPath);

  const report = await auditProtectedImage(protectedImage, {
    message: options.message,
    seed: options.seed,
    strength,
    repetitions,
    imagePath: options.outputPath,
  });

  const jsonPath = options.jsonPath ?? withSuffix(options.outputPath, ".audit.json");
  await writeFile(jsonPath, serializeReport(report), "utf-8");

  let htmlPath: string | undefined;
  if (options.html) {
    htmlPath = options.html === true ? withSuffix(options.outputPath, ".audit.html") : options.html;
    await writeFile(htmlPath, renderHtmlReport(report), "utf-8");
  }

  let sidecarPath: string | undefined;
  let sidecar: SidecarMetadata | undefined;
  if (!options.noSidecar) {
    sidecar = buildSidecar({
      version: options.sidecarVersion ?? "0.1.0",
      seed: options.seed,
      messageLength: messageBytes,
      repetitions,
      strength,
      createdAt: options.now ?? new Date().toISOString(),
      originalFile: inputPath,
      protectedFile: options.outputPath,
      ...(options.storeMessage ? { message: options.message } : {}),
    });
    sidecarPath = options.sidecarPath ?? withSuffix(options.outputPath, ".openartshield.json");
    await writeFile(sidecarPath, serializeSidecar(sidecar), "utf-8");
  }

  return {
    outputPath: options.outputPath,
    jsonPath,
    htmlPath,
    sidecarPath,
    report,
    sidecar,
    messageBytes,
  };
}

/**
 * Profile-driven protection bundle. Layer order:
 *
 *   cloak (optional) -> watermark + sidecar -> robustness audit
 *     -> verify (optional) -> ai-audit (optional)
 *
 * The cloak runs before watermarking so the watermark is embedded last and stays
 * verifiable; the ai-audit then measures the original against the final written
 * output. If the cloak finds no improving candidate, the workflow continues with
 * the unmodified original and reports that honestly.
 */
export async function protectArtwork(
  inputPath: string,
  options: ProtectArtworkOptions,
): Promise<ProtectArtworkResult> {
  const profile = resolveProfile(options.profile);
  const { layers } = profile;
  const htmlEnabled = options.html !== undefined && options.html !== false;

  // Cloak layer: perturb the original before watermarking.
  let cloak: ProtectArtworkResult["cloak"];
  let sourceImage: PixelImage | undefined;
  if (layers.cloak) {
    const backend = resolveBackend(options.backend, options.model);
    const eotMode = resolveEotMode(options.eot ?? "none");
    const eotTransforms = selectTransforms([...EOT_TRANSFORM_NAMES[eotMode]]);
    const scoreBackends = resolveScoreBackends(options.backend, options.scoreModels ?? []);

    const original = await readImage(inputPath);
    const { image: cloaked, report } = await runCloak(backend, original, {
      transforms: defaultTransforms,
      eotMode,
      eotTransforms,
      scoreBackends,
      inputPath,
      outputPath: options.outputPath,
      seed: options.seed,
      ...(options.cloakStrength !== undefined ? { strength: options.cloakStrength } : {}),
      ...(options.steps !== undefined ? { steps: options.steps } : {}),
    });

    const jsonPath = withSuffix(options.outputPath, ".cloak.json");
    await writeFile(jsonPath, serializeCloakReport(report), "utf-8");
    let htmlPath: string | undefined;
    if (htmlEnabled) {
      htmlPath = withSuffix(options.outputPath, ".cloak.html");
      await writeFile(htmlPath, renderCloakHtmlReport(report), "utf-8");
    }

    // Only bake in the cloak when it actually improved; otherwise watermark the
    // original and let the report say the cloak found nothing.
    if (report.result.improved) sourceImage = cloaked;
    cloak = { report, applied: report.result.improved, jsonPath, htmlPath };
  }

  // Trace + Audit: watermark (into the cloaked pixels when present) + reports.
  const protect = await traceAndAudit(inputPath, options, sourceImage);

  // Verify layer: read the sidecar back and confirm the watermark recovers.
  let verification: ProtectArtworkResult["verification"];
  if (layers.verify && protect.sidecarPath) {
    const verified = await verifyArtwork(options.outputPath, {
      sidecarPath: protect.sidecarPath,
    });
    verification = {
      checksumValid: verified.checksumValid,
      recoveredMessage: verified.recoveredMessage,
    };
  }

  // Measure layer: embedding drift of the final output vs. the original.
  let aiAudit: ProtectArtworkResult["aiAudit"];
  if (layers.measure) {
    const jsonPath = withSuffix(options.outputPath, ".ai-audit.json");
    const htmlPath = htmlEnabled ? withSuffix(options.outputPath, ".ai-audit.html") : undefined;
    const report = await aiAuditArtwork(inputPath, options.outputPath, {
      backend: options.backend,
      model: options.model,
      compareModels: options.compareModels,
      jsonPath,
      htmlPath,
    });
    aiAudit = { report, jsonPath, htmlPath };
  }

  return { profile, protect, cloak, aiAudit, verification };
}
