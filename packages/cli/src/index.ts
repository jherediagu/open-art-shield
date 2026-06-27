import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { cac } from "cac";
import { embedCommand } from "./commands/embed.js";
import { extractCommand } from "./commands/extract.js";
import { auditCommand } from "./commands/audit.js";
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

function requiredString(value: unknown, flag: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CliError(`${flag} is required.`);
  }
  return value;
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
        saveProtected:
          typeof options.saveProtected === "string" ? options.saveProtected : undefined,
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
