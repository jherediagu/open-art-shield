// Sidecar metadata for protected images.
//
// Extraction needs the seed, message length and repetitions - asking users to
// remember those by hand is a terrible workflow. A sidecar file records the
// extraction parameters next to the protected image so it can be verified later.
//
// By default it does NOT store the message itself - only the length and the
// technical knobs. Storing the message is opt-in (storeMessage).

/** Identifier for the v0.1 watermarking scheme. */
export const SIDECAR_ALGORITHM = "dct-basic";

export type SidecarMetadata = {
  version: string;
  algorithm: string;
  seed: number;
  messageLength: number;
  repetitions: number;
  strength: number;
  createdAt: string;
  originalFile?: string;
  protectedFile?: string;
  /** Only present when the user explicitly opted in to storing it. */
  message?: string;
};

export type BuildSidecarParams = {
  version: string;
  seed: number;
  messageLength: number;
  repetitions: number;
  strength: number;
  /** ISO timestamp. Passed in so this function stays pure/deterministic. */
  createdAt: string;
  originalFile?: string;
  protectedFile?: string;
  /** When set, the message is stored in the sidecar (off by default). */
  message?: string;
};

export function buildSidecar(params: BuildSidecarParams): SidecarMetadata {
  const sidecar: SidecarMetadata = {
    version: params.version,
    algorithm: SIDECAR_ALGORITHM,
    seed: params.seed,
    messageLength: params.messageLength,
    repetitions: params.repetitions,
    strength: params.strength,
    createdAt: params.createdAt,
  };
  if (params.originalFile !== undefined) sidecar.originalFile = params.originalFile;
  if (params.protectedFile !== undefined) sidecar.protectedFile = params.protectedFile;
  if (params.message !== undefined) sidecar.message = params.message;
  return sidecar;
}

export function serializeSidecar(sidecar: SidecarMetadata): string {
  return JSON.stringify(sidecar, null, 2);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Parse and validate a sidecar JSON string. Throws on missing/invalid fields. */
export function parseSidecar(json: string): SidecarMetadata {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("Sidecar is not valid JSON");
  }
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Sidecar must be a JSON object");
  }
  const obj = raw as Record<string, unknown>;

  if (!isFiniteNumber(obj.seed)) throw new Error("Sidecar is missing a numeric 'seed'");
  if (!isFiniteNumber(obj.messageLength) || obj.messageLength <= 0) {
    throw new Error("Sidecar is missing a positive 'messageLength'");
  }
  if (!isFiniteNumber(obj.repetitions) || obj.repetitions < 1) {
    throw new Error("Sidecar is missing a valid 'repetitions'");
  }

  const sidecar: SidecarMetadata = {
    version: typeof obj.version === "string" ? obj.version : "unknown",
    algorithm: typeof obj.algorithm === "string" ? obj.algorithm : SIDECAR_ALGORITHM,
    seed: obj.seed,
    messageLength: obj.messageLength,
    repetitions: obj.repetitions,
    strength: isFiniteNumber(obj.strength) ? obj.strength : 0,
    createdAt: typeof obj.createdAt === "string" ? obj.createdAt : "",
  };
  if (typeof obj.originalFile === "string") sidecar.originalFile = obj.originalFile;
  if (typeof obj.protectedFile === "string") sidecar.protectedFile = obj.protectedFile;
  if (typeof obj.message === "string") sidecar.message = obj.message;
  return sidecar;
}
