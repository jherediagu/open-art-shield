import { basename } from "node:path";
import {
  buildDeclareManifest,
  type TrainingMiningPreferences,
  type TrainingPreference,
} from "@openartshield/core";
import { declareFormatFromPath, signDeclaration, type DeclareSigner } from "@openartshield/node";
import { CliError } from "../utils/errors.js";
import { CLI_VERSION, info, success } from "../utils/output.js";

export type DeclareOptions = {
  input: string;
  out: string;
  /** Manifest title. Defaults to the input file name. */
  title?: string;
  /** Creator name, recorded as a CreativeWork author assertion. */
  creator?: string;
  /** Per-category policies: "allowed", "not-allowed" (default), "constrained". */
  dataMining?: string;
  aiTraining?: string;
  generativeTraining?: string;
  aiInference?: string;
  /** Free-text constraint attached to every "constrained" category. */
  constraint?: string;
  /** Sign with c2pa-node's bundled test certificate. */
  testSigner?: boolean;
  /** Certificate/key PEM paths (e.g. from `oas declare-keys`). */
  cert?: string;
  key?: string;
  /** RFC 3161 timestamp authority URL override. */
  tsaUrl?: string;
};

const USE_BY_FLAG: Record<string, TrainingPreference["use"]> = {
  allowed: "allowed",
  "not-allowed": "notAllowed",
  constrained: "constrained",
};

function parseUse(
  value: string | undefined,
  flag: string,
  constraint: string | undefined,
): TrainingPreference | undefined {
  if (value === undefined) return undefined;
  const use = USE_BY_FLAG[value];
  if (use === undefined) {
    throw new CliError(
      `${flag} must be one of ${Object.keys(USE_BY_FLAG).join(", ")}, received "${value}".`,
    );
  }
  if (use === "constrained") {
    if (constraint === undefined || constraint.length === 0) {
      throw new CliError(`${flag} constrained requires --constraint <text>.`);
    }
    return { use, constraintInfo: constraint };
  }
  return { use };
}

function resolveSigner(options: DeclareOptions): DeclareSigner {
  const hasCertOrKey = options.cert !== undefined || options.key !== undefined;
  if (options.testSigner === true && hasCertOrKey) {
    throw new CliError("Pass either --test-signer or --cert/--key, not both.");
  }
  if (options.testSigner === true) return { kind: "test" };
  if (options.cert !== undefined && options.key !== undefined) {
    return {
      kind: "local",
      certificatePath: options.cert,
      privateKeyPath: options.key,
      ...(options.tsaUrl !== undefined ? { tsaUrl: options.tsaUrl } : {}),
    };
  }
  if (hasCertOrKey) {
    throw new CliError("--cert and --key must be passed together.");
  }
  throw new CliError(
    "A signer is required: --cert/--key (generate one with `oas declare-keys`) " +
      "or --test-signer for a development signature.",
  );
}

export type DeclareResult = {
  outputPath: string;
  entries: Record<string, { use: string; constraint_info?: string }>;
  signerKind: DeclareSigner["kind"];
};

export async function runDeclare(options: DeclareOptions): Promise<DeclareResult> {
  const signer = resolveSigner(options);
  const training: TrainingMiningPreferences = {};
  const dataMining = parseUse(options.dataMining, "--data-mining", options.constraint);
  const aiTraining = parseUse(options.aiTraining, "--ai-training", options.constraint);
  const generative = parseUse(
    options.generativeTraining,
    "--generative-training",
    options.constraint,
  );
  const inference = parseUse(options.aiInference, "--ai-inference", options.constraint);
  if (dataMining !== undefined) training.dataMining = dataMining;
  if (aiTraining !== undefined) training.aiTraining = aiTraining;
  if (generative !== undefined) training.aiGenerativeTraining = generative;
  if (inference !== undefined) training.aiInference = inference;

  const manifest = buildDeclareManifest({
    title: options.title ?? basename(options.input),
    format: declareFormatFromPath(options.input),
    claimGenerator: `openartshield/${CLI_VERSION}`,
    ...(options.creator !== undefined ? { creatorName: options.creator } : {}),
    training,
  });

  const { outputPath } = await signDeclaration({
    input: options.input,
    output: options.out,
    manifest,
    signer,
  });

  const assertion = manifest.assertions[0] as {
    data: { entries: DeclareResult["entries"] };
  };
  return { outputPath, entries: assertion.data.entries, signerKind: signer.kind };
}

export async function declareCommand(options: DeclareOptions): Promise<void> {
  const result = await runDeclare(options);

  info("OpenArtShield declare (C2PA Content Credentials)");
  info("");
  info(`Image: ${options.input}`);
  for (const [key, entry] of Object.entries(result.entries)) {
    info(
      `${key}: ${entry.use}${entry.constraint_info !== undefined ? ` (${entry.constraint_info})` : ""}`,
    );
  }
  success(`Signed image written to ${result.outputPath}`);
  if (result.signerKind === "test") {
    info(
      "Note: signed with the c2pa test certificate - fine for development, but " +
        "validators will show it as a test signature. Generate your own with `oas declare-keys`.",
    );
  } else {
    info(
      "Note: self-signed certificates verify cryptographically but are not on the " +
        "C2PA trust list; validators will flag them as unknown. This declaration is a " +
        "voluntary-compliance signal, not technical protection.",
    );
  }
}
