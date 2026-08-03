import { writeFile } from "node:fs/promises";
import { readDeclaration, type DeclarationReadResult } from "@openartshield/node";
import { CliError } from "../utils/errors.js";
import { failure, info, success } from "../utils/output.js";

export type DeclareReadOptions = {
  input: string;
  /** Also write the parsed result as JSON to this path. */
  json?: string;
};

export async function runDeclareRead(
  options: DeclareReadOptions,
): Promise<DeclarationReadResult | null> {
  const result = await readDeclaration(options.input);
  if (options.json !== undefined) {
    await writeFile(options.json, `${JSON.stringify(result, null, 2)}\n`, "utf-8");
  }
  return result;
}

export async function declareReadCommand(options: DeclareReadOptions): Promise<void> {
  const result = await runDeclareRead(options);

  info("OpenArtShield declare-read (C2PA Content Credentials)");
  info("");
  info(`Image: ${options.input}`);

  if (result === null) {
    failure("No Content Credentials found in this image.");
    throw new CliError("No Content Credentials found.", 2);
  }

  if (result.title !== null) info(`Title: ${result.title}`);
  if (result.claimGenerator !== null) info(`Claim generator: ${result.claimGenerator}`);
  if (result.issuer !== null) info(`Signed by: ${result.issuer}`);

  if (result.trainingMining !== null) {
    info("Training and data mining:");
    for (const [key, entry] of Object.entries(result.trainingMining)) {
      info(
        `  ${key}: ${entry.use}${entry.constraint_info !== undefined ? ` (${entry.constraint_info})` : ""}`,
      );
    }
  } else {
    info("Training and data mining: no cawg.training-mining assertion present.");
  }

  const otherAssertions = result.assertions.filter((a) => a.label !== "cawg.training-mining");
  if (otherAssertions.length > 0) {
    info(`Other assertions: ${otherAssertions.map((a) => a.label).join(", ")}`);
  }

  if (result.validationStatus.length === 0) {
    success("Manifest read; no validation problems reported.");
  } else {
    failure(`Validation reported ${result.validationStatus.length} issue(s):`);
    for (const status of result.validationStatus) {
      info(`  ${JSON.stringify(status)}`);
    }
  }
  if (options.json !== undefined) success(`JSON written to ${options.json}`);
}
