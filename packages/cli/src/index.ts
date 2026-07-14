import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { cac } from "cac";
import { embedCommand } from "./commands/embed.js";
import { extractCommand } from "./commands/extract.js";
import { auditCommand } from "./commands/audit.js";
import { aiAuditCommand } from "./commands/ai-audit.js";
import { cloakCommand } from "./commands/cloak.js";
import { capacityCommand } from "./commands/capacity.js";
import { protectCommand } from "./commands/protect.js";
import { verifyCommand } from "./commands/verify.js";
import { versionCommand } from "./commands/version.js";
import { CLI_VERSION, failure } from "./utils/output.js";
import { CliError, errorMessage } from "./utils/errors.js";

// cac mostly coerces numbers for us, but be defensive and give a clean error
// instead of NaN sneaking through.
function optionalInt(value: unknown, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new CliError(`${flag} must be an integer, received "${String(value)}".`);
  }
  return n;
}

function requiredInt(value: unknown, flag: string): number {
  const n = optionalInt(value, flag);
  if (n === undefined) {
    throw new CliError(`${flag} is required.`);
  }
  return n;
}

// Like optionalInt but allows fractional values (e.g. --max-ssim-drop 0.02).
function optionalNumber(value: unknown, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new CliError(`${flag} must be a number, received "${String(value)}".`);
  }
  return n;
}

function requiredString(value: unknown, flag: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CliError(`${flag} is required.`);
  }
  return value;
}

// A repeatable string option: cac gives a string for one occurrence and an
// array for several. Normalize to string[] (or undefined when absent).
function optionalStringList(value: unknown, flag: string): string[] | undefined {
  if (value === undefined) return undefined;
  const values = Array.isArray(value) ? value : [value];
  return values.map((v) => {
    if (typeof v !== "string" || v.length === 0) {
      throw new CliError(`${flag} expects a non-empty value, received "${String(v)}".`);
    }
    return v;
  });
}

// Wire up the `oas` program. Kept separate from run() so tests can build it
// without actually executing anything.
export function buildCli() {
  const cli = cac("oas");

  cli
    .command("embed <input>", "Embed an invisible watermark into an image")
    .option("--message <message>", "Message to embed (UTF-8)")
    .option("--seed <seed>", "Deterministic seed for block selection")
    .option("--strength <strength>", "Embedding strength (default 8)")
    .option("--repetitions <repetitions>", "Repetition coding count (default 5)")
    .option("--out <out>", "Output path for the protected image")
    .option("--quality <quality>", "Encoder quality for lossy output formats")
    .example('  oas embed input.png --message "artist=demo" --seed 123 --out protected.png')
    .action(async (input: string, options: Record<string, unknown>) => {
      await embedCommand({
        input,
        message: requiredString(options.message, "--message"),
        seed: requiredInt(options.seed, "--seed"),
        out: requiredString(options.out, "--out"),
        strength: optionalInt(options.strength, "--strength"),
        repetitions: optionalInt(options.repetitions, "--repetitions"),
        quality: optionalInt(options.quality, "--quality"),
      });
    });

  cli
    .command("extract <input>", "Extract a watermark message from an image")
    .option("--seed <seed>", "Seed used at embedding time")
    .option("--message-length <length>", "UTF-8 byte length of the original message")
    .option("--repetitions <repetitions>", "Repetition coding count (default 5)")
    .example("  oas extract protected.png --seed 123 --message-length 34 --repetitions 5")
    .action(async (input: string, options: Record<string, unknown>) => {
      await extractCommand({
        input,
        seed: requiredInt(options.seed, "--seed"),
        messageLength: requiredInt(options.messageLength, "--message-length"),
        repetitions: optionalInt(options.repetitions, "--repetitions"),
      });
    });

  cli
    .command("audit <input>", "Embed a watermark and audit its robustness to transforms")
    .option("--message <message>", "Message to embed and attempt to recover")
    .option("--seed <seed>", "Deterministic seed for block selection")
    .option("--strength <strength>", "Embedding strength (default 8)")
    .option("--repetitions <repetitions>", "Repetition coding count (default 5)")
    .option("--out <out>", "Path to write the JSON audit report")
    .option("--html <path>", "Also write a standalone HTML report")
    .option("--save-protected <path>", "Also write the protected image to this path")
    .example('  oas audit protected.png --message "artist=demo" --seed 123 --out report.json')
    .action(async (input: string, options: Record<string, unknown>) => {
      await auditCommand({
        input,
        message: requiredString(options.message, "--message"),
        seed: requiredInt(options.seed, "--seed"),
        strength: optionalInt(options.strength, "--strength"),
        repetitions: optionalInt(options.repetitions, "--repetitions"),
        out: typeof options.out === "string" ? options.out : undefined,
        html: typeof options.html === "string" ? options.html : undefined,
        saveProtected:
          typeof options.saveProtected === "string" ? options.saveProtected : undefined,
      });
    });

  cli
    .command("ai-audit <original> <candidate>", "Measure embedding drift between two images")
    .option("--backend <id>", 'Embedding backend: "mock" (default) or "clip"')
    .option("--model <id>", "Model id for the clip backend (default Xenova/clip-vit-base-patch32)")
    .option(
      "--compare-model <id>",
      "Also measure drift on this model (repeatable; requires --backend clip)",
    )
    .option("--prompt <text>", "Optional prompt for image<->text drift")
    .option("--out <path>", "Path to write the JSON report")
    .option("--html <path>", "Also write a standalone HTML report")
    .example("  oas ai-audit original.png protected.png --out ai-audit.json --html ai-audit.html")
    .example(
      "  oas ai-audit original.png cloaked.png --backend clip --compare-model Xenova/clip-vit-base-patch16 --out transfer.json",
    )
    .action(async (original: string, candidate: string, options: Record<string, unknown>) => {
      await aiAuditCommand({
        original,
        candidate,
        backend: typeof options.backend === "string" ? options.backend : undefined,
        model: typeof options.model === "string" ? options.model : undefined,
        compareModels: optionalStringList(options.compareModel, "--compare-model"),
        prompt: typeof options.prompt === "string" ? options.prompt : undefined,
        out: typeof options.out === "string" ? options.out : undefined,
        html: typeof options.html === "string" ? options.html : undefined,
      });
    });

  cli
    .command("protect <input>", "Profile-driven protection bundle: embed, audit, reports, sidecar")
    .option(
      "--profile <name>",
      'Protection profile: "trace-only", "creator-balanced" (default), or "creator-experimental"',
    )
    .option("--message <message>", "Message to embed (UTF-8)")
    .option("--seed <seed>", "Deterministic seed for block selection")
    .option("--strength <strength>", "Watermark embedding strength (default 8)")
    .option("--repetitions <repetitions>", "Repetition coding count (default 5)")
    .option("--out <out>", "Output path for the protected image")
    .option("--json <path>", "JSON report path (default <out-basename>.audit.json)")
    .option("--html [path]", "Write HTML reports (default paths when no path is given)")
    .option("--sidecar <path>", "Sidecar path (default <out-basename>.openartshield.json)")
    .option("--skip-sidecar", "Do not write a sidecar file")
    .option("--store-message", "Store the message inside the sidecar (off by default)")
    .option("--backend <id>", 'Embedding backend for cloak/measure layers: "mock" or "clip"')
    .option("--model <id>", "Primary model id for the clip backend")
    .option("--score-model <id>", "Extra cloak scoring model (repeatable)")
    .option("--compare-model <id>", "Extra ai-audit transfer model (repeatable; requires clip)")
    .option("--eot <mode>", 'Cloak EOT mode: "none" (default), "mild", or "standard"')
    .option("--cloak-strength <number>", "Max per-channel pixel change for the cloak (default 4)")
    .option("--steps <number>", "Number of cloak candidate perturbations (default 8)")
    .option("--optimizer <name>", 'Cloak search strategy: "random" (default) or "greedy"')
    .example(
      '  oas protect input.png --message "artist=demo" --seed 123 --out protected.png --html',
    )
    .example(
      '  oas protect input.png --profile creator-experimental --message "artist=demo" --seed 123 --backend clip --eot standard --out protected.png',
    )
    .action(async (input: string, options: Record<string, unknown>) => {
      await protectCommand({
        input,
        message: requiredString(options.message, "--message"),
        seed: requiredInt(options.seed, "--seed"),
        out: requiredString(options.out, "--out"),
        profile: typeof options.profile === "string" ? options.profile : undefined,
        strength: optionalInt(options.strength, "--strength"),
        repetitions: optionalInt(options.repetitions, "--repetitions"),
        json: typeof options.json === "string" ? options.json : undefined,
        html:
          options.html === true
            ? true
            : typeof options.html === "string"
              ? options.html
              : undefined,
        sidecar: typeof options.sidecar === "string" ? options.sidecar : undefined,
        noSidecar: options.skipSidecar === true,
        storeMessage: options.storeMessage === true,
        backend: typeof options.backend === "string" ? options.backend : undefined,
        model: typeof options.model === "string" ? options.model : undefined,
        scoreModels: optionalStringList(options.scoreModel, "--score-model"),
        compareModels: optionalStringList(options.compareModel, "--compare-model"),
        eot: typeof options.eot === "string" ? options.eot : undefined,
        cloakStrength: optionalNumber(options.cloakStrength, "--cloak-strength"),
        steps: optionalInt(options.steps, "--steps"),
        optimizer: typeof options.optimizer === "string" ? options.optimizer : undefined,
      });
    });

  cli
    .command("verify <input>", "Verify a watermark using its sidecar metadata")
    .option("--sidecar <path>", "Sidecar path (default <input-basename>.openartshield.json)")
    .example("  oas verify protected.png --sidecar protected.openartshield.json")
    .action(async (input: string, options: Record<string, unknown>) => {
      await verifyCommand({
        input,
        sidecar: typeof options.sidecar === "string" ? options.sidecar : undefined,
      });
    });

  cli
    .command("cloak <input>", "Experimental: perturb an image to increase embedding drift")
    .option("--backend <id>", 'Embedding backend: "mock" (default) or "clip"')
    .option("--model <id>", "Model id for the clip backend")
    .option("--strength <number>", "Max per-channel pixel change (default 4)")
    .option("--steps <number>", "Number of candidate perturbations (default 8)")
    .option("--seed <number>", "Seed for the candidate generator (default 123)")
    .option("--min-psnr <number>", "Reject candidates below this PSNR (default 38)")
    .option(
      "--max-ssim-drop <number>",
      "Reject candidates whose SSIM drops more than this (default 0.02)",
    )
    .option("--eot <mode>", 'EOT robustness mode: "none" (default), "mild", or "standard"')
    .option(
      "--score-model <id>",
      "Also score candidates on this model (repeatable; mock backend uses deterministic variants)",
    )
    .option("--optimizer <name>", 'Search strategy: "random" (default) or "greedy"')
    .option("--mutation-rate <number>", "Fraction of pixels re-sampled per greedy mutation (0.1)")
    .option("--out <path>", "Output path for the cloaked image")
    .option("--report <path>", "Path to write the JSON cloak report")
    .option("--html <path>", "Also write a standalone HTML report")
    .example(
      "  oas cloak artwork.png --backend clip --strength 4 --steps 12 --eot standard --out artwork.cloaked.png --report cloak.json",
    )
    .example(
      "  oas cloak artwork.png --backend clip --optimizer greedy --steps 40 --eot standard --out artwork.cloaked.png",
    )
    .action(async (input: string, options: Record<string, unknown>) => {
      await cloakCommand({
        input,
        out: requiredString(options.out, "--out"),
        optimizer: typeof options.optimizer === "string" ? options.optimizer : undefined,
        mutationRate: optionalNumber(options.mutationRate, "--mutation-rate"),
        backend: typeof options.backend === "string" ? options.backend : undefined,
        model: typeof options.model === "string" ? options.model : undefined,
        scoreModels: optionalStringList(options.scoreModel, "--score-model"),
        strength: optionalNumber(options.strength, "--strength"),
        steps: optionalInt(options.steps, "--steps"),
        seed: optionalInt(options.seed, "--seed"),
        minPsnr: optionalNumber(options.minPsnr, "--min-psnr"),
        maxSsimDrop: optionalNumber(options.maxSsimDrop, "--max-ssim-drop"),
        eot: typeof options.eot === "string" ? options.eot : undefined,
        report: typeof options.report === "string" ? options.report : undefined,
        html: typeof options.html === "string" ? options.html : undefined,
      });
    });

  cli
    .command("capacity <input>", "Report whether a message fits in an image")
    .option("--message <message>", "Message you intend to embed (UTF-8)")
    .option("--repetitions <repetitions>", "Repetition coding count (default 5)")
    .example('  oas capacity input.png --message "artist=demo" --repetitions 5')
    .action(async (input: string, options: Record<string, unknown>) => {
      await capacityCommand({
        input,
        message: requiredString(options.message, "--message"),
        repetitions: optionalInt(options.repetitions, "--repetitions"),
      });
    });

  cli.command("version", "Print the OpenArtShield CLI version").action(() => {
    versionCommand();
  });

  cli.help();
  cli.version(CLI_VERSION);

  return cli;
}

// Parse + dispatch, returning an exit code. Catches CliError so we print a clean
// message instead of a stack trace.
export async function run(argv: string[]): Promise<number> {
  const cli = buildCli();
  try {
    cli.parse(argv, { run: false });
    await cli.runMatchedCommand();
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      failure(error.message);
      return error.exitCode;
    }
    failure(errorMessage(error));
    return 1;
  }
}

// Are we the entry point (the actual `oas` binary) vs. just imported?
function isMainModule(): boolean {
  const entry = argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === entry;
  } catch {
    return false;
  }
}

// Execute only when invoked directly as the `oas` binary, not when imported.
if (isMainModule()) {
  run(argv).then((code) => {
    if (code !== 0) process.exitCode = code;
  });
}
