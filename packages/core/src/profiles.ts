// Protection profiles: named combinations of OpenArtShield layers.
//
// A profile is pure data - which layers a workflow enables - so a developer can
// ask for "trace-only" or "creator-experimental" instead of hand-orchestrating
// protect/cloak/ai-audit/verify and their report paths. The actual orchestration
// (file IO, backends, transforms) lives outside core; this module only declares
// what each profile means.
//
// A profile is not a protection guarantee. Every layer it enables remains an
// experimental, measurable signal.

export type ProtectionProfileName = "trace-only" | "creator-balanced" | "creator-experimental";

export type ProtectionProfileLayers = {
  /** Embed the invisible watermark and write the sidecar. Always on. */
  trace: boolean;
  /** Verify the watermark from its sidecar after writing the output. */
  verify: boolean;
  /** Run the robustness audit (transform suite + recovery metrics). */
  audit: boolean;
  /** Run the experimental embedding cloak before watermarking. */
  cloak: boolean;
  /** Run the ai-audit (embedding drift original vs. final output). */
  measure: boolean;
};

export type ProtectionProfile = {
  name: ProtectionProfileName;
  /** One-line, honest description of what the profile does. */
  description: string;
  layers: ProtectionProfileLayers;
};

export const PROTECTION_PROFILE_NAMES: readonly ProtectionProfileName[] = [
  "trace-only",
  "creator-balanced",
  "creator-experimental",
];

/** The default when no profile is selected - matches classic `oas protect`. */
export const DEFAULT_PROTECTION_PROFILE: ProtectionProfileName = "creator-balanced";

export const PROTECTION_PROFILES: Record<ProtectionProfileName, ProtectionProfile> = {
  "trace-only": {
    name: "trace-only",
    description:
      "Traceability and verification: watermark, sidecar, verify metadata, robustness audit.",
    layers: { trace: true, verify: true, audit: true, cloak: false, measure: false },
  },
  "creator-balanced": {
    name: "creator-balanced",
    description:
      "Practical default: watermark, sidecar, robustness audit, reports. No model downloads.",
    layers: { trace: true, verify: false, audit: true, cloak: false, measure: false },
  },
  "creator-experimental": {
    name: "creator-experimental",
    description:
      "Full experimental workflow: watermark, sidecar, robustness audit, embedding cloak " +
      "(EOT and multi-model scoring when configured), ai-audit with optional transfer measurement.",
    layers: { trace: true, verify: false, audit: true, cloak: true, measure: true },
  },
};

export function isProtectionProfileName(value: string): value is ProtectionProfileName {
  return (PROTECTION_PROFILE_NAMES as readonly string[]).includes(value);
}

/** Resolve a profile by name, throwing a clear error listing the valid names. */
export function resolveProtectionProfile(name: string): ProtectionProfile {
  if (!isProtectionProfileName(name)) {
    throw new Error(
      `Unknown protection profile "${name}". Use one of: ${PROTECTION_PROFILE_NAMES.join(", ")}.`,
    );
  }
  return PROTECTION_PROFILES[name];
}
