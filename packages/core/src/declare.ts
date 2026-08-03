// Declare layer: pure builders for C2PA manifest definitions carrying the
// CAWG "Training and Data Mining" assertion (v1.1, cawg.io).
//
// This module only builds the JSON structures. Actually signing them into an
// image requires a C2PA implementation with certificates and lives in
// @openartshield/node behind the optional 'c2pa-node' dependency. Keeping the
// builders pure means they are deterministic, testable, and usable in the
// browser.
//
// Honesty note: a signed declaration is a voluntary-compliance signal - it
// tells scrapers and model trainers what they may do, and gives the creator a
// verifiable, timestamped record of having said so (which the EU AI Act's TDM
// reservation makes legally meaningful). It does not technically prevent
// anything.

/** C2PA assertion label defined by the CAWG Training and Data Mining spec. */
export const TRAINING_MINING_ASSERTION_LABEL = "cawg.training-mining";

/** The four use categories defined by the CAWG assertion. */
export const TRAINING_MINING_ENTRY_KEYS = [
  "cawg.data_mining",
  "cawg.ai_training",
  "cawg.ai_generative_training",
  "cawg.ai_inference",
] as const;

export type TrainingMiningEntryKey = (typeof TRAINING_MINING_ENTRY_KEYS)[number];

export const TRAINING_USES = ["allowed", "notAllowed", "constrained"] as const;

export type TrainingUse = (typeof TRAINING_USES)[number];

export function isTrainingUse(value: unknown): value is TrainingUse {
  return typeof value === "string" && (TRAINING_USES as readonly string[]).includes(value);
}

export type TrainingPreference = {
  use: TrainingUse;
  /** Free-text constraint description; only meaningful when use is "constrained". */
  constraintInfo?: string;
};

/**
 * Per-category preferences. Anything omitted defaults to "notAllowed" - the
 * protective default an artist reaching for this tool expects. Opening a
 * category up is an explicit choice.
 */
export type TrainingMiningPreferences = {
  dataMining?: TrainingPreference;
  aiTraining?: TrainingPreference;
  aiGenerativeTraining?: TrainingPreference;
  aiInference?: TrainingPreference;
};

export type TrainingMiningEntry = {
  use: TrainingUse;
  constraint_info?: string;
};

export type TrainingMiningAssertion = {
  label: typeof TRAINING_MINING_ASSERTION_LABEL;
  data: {
    entries: Record<TrainingMiningEntryKey, TrainingMiningEntry>;
  };
};

const PREFERENCE_TO_ENTRY_KEY: ReadonlyArray<
  [keyof TrainingMiningPreferences, TrainingMiningEntryKey]
> = [
  ["dataMining", "cawg.data_mining"],
  ["aiTraining", "cawg.ai_training"],
  ["aiGenerativeTraining", "cawg.ai_generative_training"],
  ["aiInference", "cawg.ai_inference"],
];

function toEntry(preference: TrainingPreference | undefined): TrainingMiningEntry {
  if (preference === undefined) return { use: "notAllowed" };
  if (!isTrainingUse(preference.use)) {
    throw new Error(
      `Invalid training use "${String(preference.use)}". Use one of: ${TRAINING_USES.join(", ")}.`,
    );
  }
  const entry: TrainingMiningEntry = { use: preference.use };
  if (preference.constraintInfo !== undefined) {
    if (preference.use !== "constrained") {
      throw new Error('constraintInfo is only valid when use is "constrained".');
    }
    entry.constraint_info = preference.constraintInfo;
  }
  return entry;
}

/**
 * Build the CAWG training-and-data-mining assertion. Omitted categories are
 * "notAllowed" (deny by default).
 */
export function buildTrainingMiningAssertion(
  preferences: TrainingMiningPreferences = {},
): TrainingMiningAssertion {
  const entries = {} as Record<TrainingMiningEntryKey, TrainingMiningEntry>;
  for (const [prefKey, entryKey] of PREFERENCE_TO_ENTRY_KEY) {
    entries[entryKey] = toEntry(preferences[prefKey]);
  }
  return { label: TRAINING_MINING_ASSERTION_LABEL, data: { entries } };
}

/** A single assertion in a manifest definition (label + arbitrary JSON data). */
export type DeclareAssertion = {
  label: string;
  data: unknown;
  kind?: string;
};

/**
 * The subset of a C2PA manifest definition we produce. Field names follow the
 * c2pa manifest JSON (snake_case) so it can be handed to a C2PA SDK as-is.
 */
export type DeclareManifestDefinition = {
  claim_generator: string;
  format: string;
  title: string;
  assertions: DeclareAssertion[];
};

/** Image formats the Declare layer signs. */
export const DECLARE_FORMATS = ["image/jpeg", "image/png", "image/webp"] as const;

export type DeclareFormat = (typeof DECLARE_FORMATS)[number];

export function isDeclareFormat(value: unknown): value is DeclareFormat {
  return typeof value === "string" && (DECLARE_FORMATS as readonly string[]).includes(value);
}

export type BuildDeclareManifestParams = {
  /** Manifest title, typically the file name. */
  title: string;
  /** MIME type of the asset being signed. */
  format: DeclareFormat;
  /** Claim generator string, e.g. "openartshield/0.1.0". */
  claimGenerator: string;
  /** Optional creator name, recorded as a schema.org CreativeWork author. */
  creatorName?: string;
  /** Training/mining preferences; omitted categories are "notAllowed". */
  training?: TrainingMiningPreferences;
};

/**
 * Build a manifest definition with the training-mining assertion and (when a
 * creator is given) a schema.org CreativeWork author assertion.
 */
export function buildDeclareManifest(
  params: BuildDeclareManifestParams,
): DeclareManifestDefinition {
  if (params.title.length === 0) throw new Error("Manifest title must not be empty.");
  if (params.claimGenerator.length === 0) {
    throw new Error("Manifest claimGenerator must not be empty.");
  }
  if (!isDeclareFormat(params.format)) {
    throw new Error(
      `Unsupported declare format "${String(params.format)}". Use one of: ${DECLARE_FORMATS.join(", ")}.`,
    );
  }

  const assertions: DeclareAssertion[] = [buildTrainingMiningAssertion(params.training)];
  if (params.creatorName !== undefined && params.creatorName.length > 0) {
    assertions.push({
      label: "stds.schema-org.CreativeWork",
      data: {
        "@context": "https://schema.org",
        "@type": "CreativeWork",
        author: [{ "@type": "Person", name: params.creatorName }],
      },
      kind: "Json",
    });
  }

  return {
    claim_generator: params.claimGenerator,
    format: params.format,
    title: params.title,
    assertions,
  };
}
