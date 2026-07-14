import {
  DEFAULT_PROTECTION_PROFILE,
  PROTECTION_PROFILE_NAMES,
  PROTECTION_PROFILES,
  isProtectionProfileName,
  type AuditReport,
  type CloakReport,
  type EmbeddingAuditReport,
  type ProtectionProfile,
  type SidecarMetadata,
} from "@openartshield/core";
import {
  protectArtwork,
  type ProtectArtworkResult,
  type ProtectArtworkTraceResult,
} from "@openartshield/node";
import { CliError } from "../utils/errors.js";
import { CLI_VERSION, failure, info, success } from "../utils/output.js";

// Thin wrappers over the @openartshield/node SDK (`protectArtwork`): the CLI
// owns flag parsing, CliError texts, and terminal output; the orchestration
// lives in the node package so SDK consumers get the same workflow.

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
  /** Cloak search strategy: "random" (default) or "greedy". */
  optimizer?: string;
  /** Fraction of pixels re-sampled per greedy mutation (default 0.1). */
  mutationRate?: number;
};

export type ProtectWorkflowResult = {
  profile: ProtectionProfile;
  protect: ProtectResult;
  cloak?: {
    report: CloakReport;
    applied: boolean;
    jsonPath: string;
    htmlPath?: string;
  };
  aiAudit?: {
    report: EmbeddingAuditReport;
    jsonPath: string;
    htmlPath?: string;
  };
  verification?: {
    checksumValid: boolean;
    recoveredMessage: string | null;
  };
};

function toProtectResult(p: ProtectArtworkTraceResult): ProtectResult {
  return {
    outPath: p.outputPath,
    jsonPath: p.jsonPath,
    htmlPath: p.htmlPath,
    sidecarPath: p.sidecarPath,
    report: p.report,
    sidecar: p.sidecar,
    messageBytes: p.messageBytes,
  };
}

function toWorkflowResult(r: ProtectArtworkResult): ProtectWorkflowResult {
  return {
    profile: r.profile,
    protect: toProtectResult(r.protect),
    cloak: r.cloak,
    aiAudit: r.aiAudit,
    verification: r.verification,
  };
}

function resolveProfileOrFail(name: string | undefined): ProtectionProfile {
  const value = name ?? DEFAULT_PROTECTION_PROFILE;
  if (!isProtectionProfileName(value)) {
    throw new CliError(
      `Unknown protection profile "${value}". Use one of: ${PROTECTION_PROFILE_NAMES.join(", ")}.`,
    );
  }
  return PROTECTION_PROFILES[value];
}

async function callProtectArtwork(
  options: ProtectWorkflowOptions,
  profile: string,
): Promise<ProtectArtworkResult> {
  if (!options.message) {
    throw new CliError("A non-empty --message is required.");
  }
  return protectArtwork(options.input, {
    profile,
    message: options.message,
    seed: options.seed,
    outputPath: options.out,
    strength: options.strength,
    repetitions: options.repetitions,
    jsonPath: options.json,
    html: options.html,
    sidecarPath: options.sidecar,
    noSidecar: options.noSidecar,
    storeMessage: options.storeMessage,
    now: options.now,
    sidecarVersion: CLI_VERSION,
    backend: options.backend,
    model: options.model,
    scoreModels: options.scoreModels,
    compareModels: options.compareModels,
    eot: options.eot,
    cloakStrength: options.cloakStrength,
    steps: options.steps,
    optimizer: options.optimizer,
    mutationRate: options.mutationRate,
  });
}

/** Classic Trace + Audit workflow (equivalent to --profile creator-balanced). */
export async function runProtect(options: ProtectOptions): Promise<ProtectResult> {
  const r = await callProtectArtwork(options, "creator-balanced");
  return toProtectResult(r.protect);
}

/** Profile-driven protection bundle. See `protectArtwork` in @openartshield/node. */
export async function runProtectWorkflow(
  options: ProtectWorkflowOptions,
): Promise<ProtectWorkflowResult> {
  const profile = resolveProfileOrFail(options.profile);
  return toWorkflowResult(await callProtectArtwork(options, profile.name));
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
