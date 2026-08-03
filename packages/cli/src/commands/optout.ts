import {
  buildXmpDataMiningPacket,
  PLUS_DATA_MINING_VALUES,
  type DataMiningPolicy,
} from "@openartshield/core";
import { writeImageWithXmp } from "@openartshield/node";
import { CliError } from "../utils/errors.js";
import { info, success } from "../utils/output.js";

export type OptOutOptions = {
  input: string;
  out: string;
  /** Data-mining policy (kebab-case). Default "prohibited-ai-training". */
  policy?: string;
  /** Creator name (dc:creator). */
  creator?: string;
  /** URL of a rights/usage statement (xmpRights:WebStatement). */
  webStatement?: string;
  /** Free-text constraint (plus:OtherConstraints). */
  constraint?: string;
  /** Encoder quality for lossy output formats. */
  quality?: number;
};

export const OPTOUT_POLICY_BY_FLAG: Record<string, DataMiningPolicy> = {
  allowed: "allowed",
  prohibited: "prohibited",
  "prohibited-ai-training": "prohibitedAiTraining",
  "prohibited-genai-training": "prohibitedGenAiTraining",
  "prohibited-except-search": "prohibitedExceptSearch",
};

export const DEFAULT_OPTOUT_POLICY_FLAG = "prohibited-ai-training";

export type OptOutResult = {
  outPath: string;
  policyUri: string;
};

export async function runOptOut(options: OptOutOptions): Promise<OptOutResult> {
  const flag = options.policy ?? DEFAULT_OPTOUT_POLICY_FLAG;
  const policy = OPTOUT_POLICY_BY_FLAG[flag];
  if (policy === undefined) {
    throw new CliError(
      `--policy must be one of ${Object.keys(OPTOUT_POLICY_BY_FLAG).join(", ")}, received "${flag}".`,
    );
  }

  const packet = buildXmpDataMiningPacket({
    policy,
    ...(options.creator !== undefined ? { creatorName: options.creator } : {}),
    ...(options.webStatement !== undefined ? { webStatementUrl: options.webStatement } : {}),
    ...(options.constraint !== undefined ? { constraintInfo: options.constraint } : {}),
  });
  await writeImageWithXmp(
    options.input,
    options.out,
    packet,
    options.quality !== undefined ? { quality: options.quality } : {},
  );
  return { outPath: options.out, policyUri: PLUS_DATA_MINING_VALUES[policy] };
}

export async function optOutCommand(options: OptOutOptions): Promise<void> {
  const result = await runOptOut(options);

  info("OpenArtShield optout (IPTC plus:DataMining XMP)");
  info("");
  info(`Image: ${options.input}`);
  info(`Policy: ${result.policyUri}`);
  success(`Image with opt-out metadata written to ${result.outPath}`);
  info(
    "Note: XMP metadata is a reservation, not protection - compliant crawlers respect " +
      "it and the EU AI Act requires providers to honor it, but it is trivially strippable. " +
      "Combine it with site-level signals (`oas optout-site`) and a signed declaration (`oas declare`).",
  );
}
