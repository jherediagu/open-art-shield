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
import {
  auditProtectedImage,
  defaultTransforms,
  readImage,
  selectTransforms,
  writeImage,
} from "@openartshield/node";
import { resolveEmbeddingBackend, resolveScoreBackends } from "../utils/backend.js";
import { CliError } from "../utils/errors.js";
import { CLI_VERSION, failure, info, success } from "../utils/output.js";
import { runAiAudit } from "./ai-audit.js";
import { runVerify } from "./verify.js";

export type ProtectOptions = {
  input: string;
  message: string;
  seed: number;
  /** Watermark embedding strength (default 8). Not the cloak strength. */
  strength?: number;
  repetitions?: number;
  out: string;
  /** JSON report path. Defaults to <out-basename>.audit.json. */
  json?: string;
  /**
   * HTML report. A string is the audit HTML path; `true` uses the default
   * <out-basename>.audit.html (and default paths for any other profile reports).
   */
  html?: string | boolean;
  /** Sidecar path. Defaults to <out-basename>.openartshield.json. */
  sidecar?: string;
  /** Skip writing the sidecar entirely. */
  noSidecar?: boolean;
  /** Store the message inside the sidecar (off by default). */
  storeMessage?: boolean;
  /** ISO timestamp for the sidecar; injected for deterministic tests. */
  now?: string;
  /**
   * Pre-processed pixels to embed into instead of re-reading `input` (used by
   * the profile workflow to watermark the cloaked image). `input` is still
   * recorded as the original file in the sidecar.
   */
  sourceImage?: PixelImage;
};

export type ProtectResult = {
  outPath: string;
  jsonPath: string;
  htmlPath?: string;
  sidecarPath?: string;
  report: AuditReport;
  sidecar?: SidecarMetadata;
  messageBytes: number;
};

/** Drop a path's extension and append `suffix`, e.g. protected.png -> protected.audit.json. */
function withSuffix(outPath: string, suffix: string): string {
  const ext = extname(outPath);
  const base = ext ? outPath.slice(0, -ext.length) : outPath;
  return base + suffix;
}

/**
 * The one-command Trace + Audit workflow: capacity check -> embed -> audit ->
 * reports -> sidecar. Fails early (before embedding) if the message doesn't fit.
 */
export async function runProtect(options: ProtectOptions): Promise<ProtectResult> {
  if (!options.message) {
    throw new CliError("A non-empty --message is required.");
  }

  const repetitions = options.repetitions ?? DEFAULT_REPETITIONS;
  const strength = options.strength ?? DEFAULT_STRENGTH;
  const messageBytes = messageByteLength(options.message);

  const image = options.sourceImage ?? (await readImage(options.input));

  // Capacity check first, so we never write a half-baked image.
  const capacity = estimateCapacity({
    width: image.width,
    height: image.height,
    messageByteLength: messageBytes,
    repetitions,
  });
  if (!capacity.fits) {
    throw new CliError(
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
  await writeImage(protectedImage, options.out);

  const report = await auditProtectedImage(protectedImage, {
    message: options.message,
    seed: options.seed,
    strength,
    repetitions,
    imagePath: options.out,
  });

  const jsonPath = options.json ?? withSuffix(options.out, ".audit.json");
  await writeFile(jsonPath, serializeReport(report), "utf-8");

  let htmlPath: string | undefined;
  if (options.html) {
    htmlPath = options.html === true ? withSuffix(options.out, ".audit.html") : options.html;
    await writeFile(htmlPath, renderHtmlReport(report), "utf-8");
  }

  let sidecarPath: string | undefined;
  let sidecar: SidecarMetadata | undefined;
  if (!options.noSidecar) {
    sidecar = buildSidecar({
      version: CLI_VERSION,
      seed: options.seed,
      messageLength: messageBytes,
      repetitions,
      strength,
      createdAt: options.now ?? new Date().toISOString(),
      originalFile: options.input,
      protectedFile: options.out,
      ...(options.storeMessage ? { message: options.message } : {}),
    });
    sidecarPath = options.sidecar ?? withSuffix(options.out, ".openartshield.json");
    await writeFile(sidecarPath, serializeSidecar(sidecar), "utf-8");
  }

  return { outPath: options.out, jsonPath, htmlPath, sidecarPath, report, sidecar, messageBytes };
}

export type ProtectWorkflowOptions = ProtectOptions & {
  /** Protection profile (default "creator-balanced" = classic protect behavior). */
  profile?: string;
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
  /** Max per-channel pixel change for the cloak candidates (default 4). */
  cloakStrength?: number;
  /** Number of cloak candidate perturbations (default 8). */
  steps?: number;
};

export type ProtectWorkflowResult = {
  profile: ProtectionProfile;
  protect: ProtectResult;
  /** Present when the profile runs the cloak layer. */
  cloak?: {
    report: CloakReport;
    /** Whether the cloak actually improved drift and was baked into the output. */
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

function resolveProfileOrFail(name: string | undefined): ProtectionProfile {
  const value = name ?? DEFAULT_PROTECTION_PROFILE;
  if (!isProtectionProfileName(value)) {
    throw new CliError(
      `Unknown protection profile "${value}". Use one of: ${PROTECTION_PROFILE_NAMES.join(", ")}.`,
    );
  }
  return PROTECTION_PROFILES[value];
}

/**
 * Profile-driven protection bundle. Layer order:
 *
 *   cloak (optional) -> watermark + sidecar -> robustness audit
 *     -> verify (optional) -> ai-audit (optional)
 *
 * The cloak runs *before* watermarking so the watermark is embedded last and
 * stays verifiable; the ai-audit then measures the original against the final
 * written output. If the cloak finds no improving candidate, the workflow
 * continues with the unmodified original and reports that honestly.
 */
export async function runProtectWorkflow(
  options: ProtectWorkflowOptions,
): Promise<ProtectWorkflowResult> {
  const profile = resolveProfileOrFail(options.profile);
  const { layers } = profile;
  const htmlEnabled = options.html !== undefined && options.html !== false;

  // Cloak layer: perturb the original before watermarking.
  let cloak: ProtectWorkflowResult["cloak"];
  let sourceImage: PixelImage | undefined;
  if (layers.cloak) {
    const backend = resolveEmbeddingBackend(options.backend, options.model);
    const eotMode = resolveEotMode(options.eot ?? "none");
    const eotTransforms = selectTransforms([...EOT_TRANSFORM_NAMES[eotMode]]);
    const scoreBackends = resolveScoreBackends(options.backend, options.scoreModels ?? []);

    const original = await readImage(options.input);
    const { image: cloaked, report } = await runCloak(backend, original, {
      transforms: defaultTransforms,
      eotMode,
      eotTransforms,
      scoreBackends,
      inputPath: options.input,
      outputPath: options.out,
      seed: options.seed,
      ...(options.cloakStrength !== undefined ? { strength: options.cloakStrength } : {}),
      ...(options.steps !== undefined ? { steps: options.steps } : {}),
    });

    const jsonPath = withSuffix(options.out, ".cloak.json");
    await writeFile(jsonPath, serializeCloakReport(report), "utf-8");
    let htmlPath: string | undefined;
    if (htmlEnabled) {
      htmlPath = withSuffix(options.out, ".cloak.html");
      await writeFile(htmlPath, renderCloakHtmlReport(report), "utf-8");
    }

    // Only bake in the cloak when it actually improved; otherwise watermark the
    // original and let the report say the cloak found nothing.
    if (report.result.improved) sourceImage = cloaked;
    cloak = { report, applied: report.result.improved, jsonPath, htmlPath };
  }

  // Trace + Audit: watermark (into the cloaked pixels when present) + reports.
  const protect = await runProtect({
    ...options,
    ...(sourceImage !== undefined ? { sourceImage } : {}),
  });

  // Verify layer: read the sidecar back and confirm the watermark recovers.
  let verification: ProtectWorkflowResult["verification"];
  if (layers.verify && protect.sidecarPath) {
    const verified = await runVerify({ input: options.out, sidecar: protect.sidecarPath });
    verification = {
      checksumValid: verified.checksumValid,
      recoveredMessage: verified.recoveredMessage,
    };
  }

  // Measure layer: embedding drift of the final output vs. the original.
  let aiAudit: ProtectWorkflowResult["aiAudit"];
  if (layers.measure) {
    const jsonPath = withSuffix(options.out, ".ai-audit.json");
    const htmlPath = htmlEnabled ? withSuffix(options.out, ".ai-audit.html") : undefined;
    const report = await runAiAudit({
      original: options.input,
      candidate: options.out,
      backend: options.backend,
      model: options.model,
      compareModels: options.compareModels,
      out: jsonPath,
      html: htmlPath,
    });
    aiAudit = { report, jsonPath, htmlPath };
  }

  return { profile, protect, cloak, aiAudit, verification };
}

export async function protectCommand(options: ProtectWorkflowOptions): Promise<void> {
  // Resolve early: fails clearly on an unknown profile before any work.
  const selected = resolveProfileOrFail(options.profile);
  if (
    (selected.layers.cloak || selected.layers.measure) &&
    (options.backend ?? "mock") === "mock"
  ) {
    failure(
      "Using the 'mock' backend for the cloak/measure layers: it is a deterministic " +
        "placeholder, not a perceptual model. Use --backend clip for real runs.",
    );
  }

  const r = await runProtectWorkflow(options);
  const { layers } = r.profile;
  const { summary } = r.protect.report;
  const failed = summary.totalTransforms - summary.successfulRecoveries;

  info("OpenArtShield protect");
  info("");
  info(`Input: ${options.input}`);
  info(`Output: ${r.protect.outPath}`);
  info(`Profile: ${r.profile.name}`);
  info("");
  info("Layers:");
  info(`Trace: ${layers.trace ? "enabled" : "disabled"}`);
  info(`Audit: ${layers.audit ? "enabled" : "disabled"}`);
  info(`Cloak: ${layers.cloak ? "enabled" : "disabled"}`);
  info(`Measure: ${layers.measure ? "enabled" : "disabled"}`);
  if (layers.verify) info("Verify: enabled");
  if (layers.cloak || layers.measure) {
    info("");
    info(`Backend: ${options.backend ?? "mock"}`);
    if (r.cloak) {
      info(`Primary model: ${r.cloak.report.scoring.primaryModel}`);
      if (r.cloak.report.scoring.scoreModels.length > 0) {
        info(`Score models: ${r.cloak.report.scoring.scoreModels.join(", ")}`);
      }
      info(`EOT: ${r.cloak.report.eot.mode}`);
    }
  }
  info("");
  info(`Message bytes: ${r.protect.messageBytes}`);
  info(`Transforms tested: ${summary.totalTransforms}`);
  info(`Successful recoveries: ${summary.successfulRecoveries}`);
  info(`Failed recoveries: ${failed}`);
  if (r.cloak) {
    info(
      r.cloak.applied
        ? `Cloak: applied (aggregate drift ${r.cloak.report.scoring.aggregateAverageDrift.toFixed(4)}, ` +
            `weakest model ${r.cloak.report.scoring.aggregateMinModelDrift.toFixed(4)})`
        : "Cloak: no candidate improved drift; output is watermark-only",
    );
  }
  if (r.aiAudit) {
    info(`AI audit drift: ${r.aiAudit.report.embedding.drift.toFixed(4)}`);
    if (r.aiAudit.report.transfer) {
      info(
        `Transfer drift (avg): ${r.aiAudit.report.transfer.summary.averageTransferDrift.toFixed(4)}`,
      );
    }
  }
  if (r.verification) {
    info(`Verification: ${r.verification.checksumValid ? "checksum valid" : "checksum INVALID"}`);
  }
  info("");
  info("Reports:");
  if (r.protect.sidecarPath) info(`Sidecar: ${r.protect.sidecarPath}`);
  info(`Audit JSON: ${r.protect.jsonPath}`);
  if (r.protect.htmlPath) info(`Audit HTML: ${r.protect.htmlPath}`);
  if (r.cloak) {
    info(`Cloak JSON: ${r.cloak.jsonPath}`);
    if (r.cloak.htmlPath) info(`Cloak HTML: ${r.cloak.htmlPath}`);
  }
  if (r.aiAudit) {
    info(`AI audit JSON: ${r.aiAudit.jsonPath}`);
    if (r.aiAudit.htmlPath) info(`AI audit HTML: ${r.aiAudit.htmlPath}`);
  }
  success("Done.");
}
